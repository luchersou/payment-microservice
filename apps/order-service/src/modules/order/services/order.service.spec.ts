import { OrderStatus } from '@order/prisma/generated/prisma/enums';

import { OutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import { CancelReason } from '@contracts/order-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderService } from './order.service';

jest.mock('@order/prisma/prisma.service', () => ({ PrismaService: class {} }));

type FakeOrder = {
  id: string;
  userId?: string | null;
  total?: number | null;
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
};

function makeFakePrisma() {
  const orders = new Map<string, FakeOrder>();

  const order = {
    create: jest.fn(
      ({ data }: { data: Omit<FakeOrder, 'createdAt' | 'updatedAt'> }) => {
        if (orders.has(data.id)) {
          return Promise.reject(
            Object.assign(new Error('Unique'), { code: 'P2002' }),
          );
        }
        const now = new Date();
        const created = { ...data, createdAt: now, updatedAt: now };
        orders.set(data.id, created);
        return Promise.resolve({ ...created });
      },
    ),
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        orders.has(where.id) ? { ...orders.get(where.id)! } : null,
      ),
    ),
    findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve({ ...orders.get(where.id)! }),
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string; status: { in: OrderStatus[] } };
        data: { status: OrderStatus };
      }) => {
        const current = orders.get(where.id);
        if (!current || !where.status.in.includes(current.status)) {
          return Promise.resolve({ count: 0 });
        }
        orders.set(where.id, { ...current, ...data, updatedAt: new Date() });
        return Promise.resolve({ count: 1 });
      },
    ),
  };

  const seed = (id: string, status: OrderStatus) =>
    orders.set(id, {
      id,
      userId: 'user-1',
      total: 100,
      status,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  const outbox: OutboxRecord[] = [];
  const outboxMessage = {
    create: jest.fn(({ data }: { data: OutboxRecord }) => {
      outbox.push(data);
      return Promise.resolve(data);
    }),
  };

  const client = { order, outboxMessage };
  const prisma = {
    ...client,
    // Runs on the same fake, restoring it if the callback throws (rollback)
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = new Map(orders);
      const outboxLength = outbox.length;
      try {
        return await fn(client);
      } catch (error) {
        orders.clear();
        snapshot.forEach((value, key) => orders.set(key, value));
        outbox.length = outboxLength;
        throw error;
      }
    }),
  };

  return { prisma, orders, outbox, seed };
}

function makeMetrics() {
  return {
    startMessageProcessingTimer: jest.fn(() => jest.fn()),
    incrementOrdersCreated: jest.fn(),
    incrementOrdersCompleted: jest.fn(),
    incrementOrdersCancelled: jest.fn(),
    incrementOrdersFailed: jest.fn(),
  };
}

describe('OrderService', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let metrics: ReturnType<typeof makeMetrics>;
  let service: OrderService;

  beforeEach(() => {
    fake = makeFakePrisma();
    metrics = makeMetrics();
    service = new OrderService(
      fake.prisma as never,
      metrics as unknown as OrderMetricsService,
    );
  });

  const outboxRoutingKeys = () => fake.outbox.map((r) => r.routingKey);

  describe('createOrder', () => {
    const payload = { orderId: 'order-1', userId: 'user-1', total: 100 };

    it('persists the order with the given id and writes OrderCreated to the outbox', async () => {
      await service.createOrder(payload);

      expect(fake.orders.get('order-1')?.status).toBe(
        OrderStatus.PENDING_PAYMENT,
      );
      expect(metrics.incrementOrdersCreated).toHaveBeenCalledTimes(1);
      expect(fake.outbox).toEqual([
        expect.objectContaining({
          exchange: Exchanges.ORDERS,
          routingKey: RoutingKeys.ORDER_CREATED,
          payload: expect.objectContaining({
            payload: { orderId: 'order-1', userId: 'user-1', total: 100 },
          }),
        }),
      ]);
    });

    it('does not create a duplicate order nor event on redelivery', async () => {
      await service.createOrder(payload);
      await service.createOrder(payload);

      expect(fake.orders.size).toBe(1);
      expect(metrics.incrementOrdersCreated).toHaveBeenCalledTimes(1);
      expect(fake.outbox).toHaveLength(1);
    });

    it('rolls the order back when its event cannot be written, so the retry creates both', async () => {
      fake.prisma.outboxMessage.create.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(service.createOrder(payload)).rejects.toThrow('db down');
      expect(fake.orders.size).toBe(0);

      await service.createOrder(payload);

      expect(fake.orders.size).toBe(1);
      expect(outboxRoutingKeys()).toEqual([RoutingKeys.ORDER_CREATED]);
    });

    it('writes nothing when the order already progressed', async () => {
      fake.seed('order-1', OrderStatus.PAID);

      await service.createOrder(payload);

      expect(fake.outbox).toHaveLength(0);
    });
  });

  describe('completeOrder', () => {
    it('moves PENDING_PAYMENT to PAID', async () => {
      fake.seed('o', OrderStatus.PENDING_PAYMENT);

      await service.completeOrder('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.PAID);
      expect(metrics.incrementOrdersCompleted).toHaveBeenCalledTimes(1);
    });

    it.each([OrderStatus.CANCELLED, OrderStatus.FAILED, OrderStatus.PAID])(
      'leaves a %s order untouched',
      async (status) => {
        fake.seed('o', status);

        await service.completeOrder('o');

        expect(fake.orders.get('o')?.status).toBe(status);
        expect(metrics.incrementOrdersCompleted).not.toHaveBeenCalled();
      },
    );
  });

  describe('failOrder', () => {
    it('moves PENDING_PAYMENT to FAILED', async () => {
      fake.seed('o', OrderStatus.PENDING_PAYMENT);

      await service.failOrder('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.FAILED);
      expect(metrics.incrementOrdersFailed).toHaveBeenCalledTimes(1);
    });

    it.each([OrderStatus.PAID, OrderStatus.CANCELLED])(
      'does not overwrite a %s order',
      async (status) => {
        fake.seed('o', status);

        await service.failOrder('o');

        expect(fake.orders.get('o')?.status).toBe(status);
      },
    );
  });

  describe('cancelByUser', () => {
    it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.PAID])(
      'cancels a %s order and writes OrderCancelled to the outbox',
      async (status) => {
        fake.seed('o', status);

        await service.cancelByUser('o');

        expect(fake.orders.get('o')?.status).toBe(OrderStatus.CANCELLED);
        expect(metrics.incrementOrdersCancelled).toHaveBeenCalledWith(
          CancelReason.USER_REQUESTED,
        );
        expect(fake.outbox).toEqual([
          expect.objectContaining({
            exchange: Exchanges.ORDERS,
            routingKey: RoutingKeys.ORDER_CANCELLED,
            payload: expect.objectContaining({
              payload: expect.objectContaining({
                orderId: 'o',
                reason: CancelReason.USER_REQUESTED,
              }),
            }),
          }),
        ]);
      },
    );

    it('records a CANCELLED tombstone when the order does not exist yet', async () => {
      await service.cancelByUser('missing');

      const tombstone = fake.orders.get('missing');
      expect(tombstone?.status).toBe(OrderStatus.CANCELLED);
      expect(tombstone?.userId).toBeUndefined();
      expect(tombstone?.total).toBeUndefined();
      expect(metrics.incrementOrdersCancelled).toHaveBeenCalledWith(
        CancelReason.USER_REQUESTED,
      );
      expect(outboxRoutingKeys()).toEqual([RoutingKeys.ORDER_CANCELLED]);
    });

    it('a create request handled after the tombstone never writes OrderCreated', async () => {
      await service.cancelByUser('order-1');
      await service.createOrder({
        orderId: 'order-1',
        userId: 'user-1',
        total: 100,
      });

      expect(fake.orders.get('order-1')?.status).toBe(OrderStatus.CANCELLED);
      expect(metrics.incrementOrdersCreated).not.toHaveBeenCalled();
      expect(outboxRoutingKeys()).not.toContain(RoutingKeys.ORDER_CREATED);
    });

    it('cancels the order the create request persisted between the update and the tombstone insert', async () => {
      fake.seed('o', OrderStatus.PENDING_PAYMENT);
      fake.prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });
      fake.prisma.order.findUnique.mockResolvedValueOnce(null);

      await service.cancelByUser('o');

      expect(fake.orders.size).toBe(1);
      expect(fake.orders.get('o')?.status).toBe(OrderStatus.CANCELLED);
      expect(metrics.incrementOrdersCancelled).toHaveBeenCalledTimes(1);
      expect(outboxRoutingKeys()).toEqual([RoutingKeys.ORDER_CANCELLED]);
    });

    it('writes nothing again when already cancelled (redelivery)', async () => {
      fake.seed('o', OrderStatus.CANCELLED);

      await service.cancelByUser('o');

      expect(fake.outbox).toHaveLength(0);
      expect(metrics.incrementOrdersCancelled).not.toHaveBeenCalled();
    });

    it('skips a FAILED order', async () => {
      fake.seed('o', OrderStatus.FAILED);

      await service.cancelByUser('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.FAILED);
      expect(fake.outbox).toHaveLength(0);
    });
  });

  describe('failOrder (PaymentDeclined / PaymentFailed)', () => {
    it('fails a PENDING_PAYMENT order without publishing anything', async () => {
      fake.seed('o', OrderStatus.PENDING_PAYMENT);

      await service.failOrder('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.FAILED);
      expect(fake.outbox).toHaveLength(0);
      expect(metrics.incrementOrdersCancelled).not.toHaveBeenCalled();
    });

    it('never marks a PAID order as FAILED', async () => {
      fake.seed('o', OrderStatus.PAID);

      await service.failOrder('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.PAID);
      expect(fake.outbox).toHaveLength(0);
    });

    it('ignores an unknown order', async () => {
      await expect(service.failOrder('missing')).resolves.toBeUndefined();
      expect(fake.orders.size).toBe(0);
    });
  });
});
