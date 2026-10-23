import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { OrderStatus } from '@order/prisma/generated/prisma/enums';

import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import { CancelReason } from '@contracts/order-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderNotFoundYetError, OrderService } from './order.service';

jest.mock('@order/prisma/prisma.service', () => ({ PrismaService: class {} }));

type FakeOrder = {
  id: string;
  userId: string;
  total: number;
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

  return { prisma: { order }, orders, seed };
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
  let amqp: { publish: jest.Mock };
  let metrics: ReturnType<typeof makeMetrics>;
  let service: OrderService;

  beforeEach(() => {
    fake = makeFakePrisma();
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    metrics = makeMetrics();
    service = new OrderService(
      amqp as unknown as AmqpConnection,
      fake.prisma as never,
      metrics as unknown as OrderMetricsService,
    );
  });

  describe('createOrder', () => {
    const payload = { orderId: 'order-1', userId: 'user-1', total: 100 };

    it('persists the order with the given id and publishes OrderCreated', async () => {
      await service.createOrder(payload);

      expect(fake.orders.get('order-1')?.status).toBe(
        OrderStatus.PENDING_PAYMENT,
      );
      expect(metrics.incrementOrdersCreated).toHaveBeenCalledTimes(1);
      expect(amqp.publish).toHaveBeenCalledWith(
        Exchanges.ORDERS,
        RoutingKeys.ORDER_CREATED,
        expect.objectContaining({
          payload: { orderId: 'order-1', userId: 'user-1', total: 100 },
        }),
        expect.objectContaining({ persistent: true }),
      );
    });

    it('does not create a duplicate on redelivery and republishes while pending', async () => {
      await service.createOrder(payload);
      await service.createOrder(payload);

      expect(fake.orders.size).toBe(1);
      expect(metrics.incrementOrdersCreated).toHaveBeenCalledTimes(1);
      expect(amqp.publish).toHaveBeenCalledTimes(2);
    });

    it('recovers when the first attempt persisted but failed to publish', async () => {
      amqp.publish.mockRejectedValueOnce(new Error('broker down'));

      await expect(service.createOrder(payload)).rejects.toThrow('broker down');
      await service.createOrder(payload);

      expect(fake.orders.size).toBe(1);
      expect(amqp.publish).toHaveBeenCalledTimes(2);
    });

    it('does not republish when the order already progressed', async () => {
      fake.seed('order-1', OrderStatus.PAID);

      await service.createOrder(payload);

      expect(amqp.publish).not.toHaveBeenCalled();
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
      'cancels a %s order and publishes OrderCancelled',
      async (status) => {
        fake.seed('o', status);

        await service.cancelByUser('o');

        expect(fake.orders.get('o')?.status).toBe(OrderStatus.CANCELLED);
        expect(metrics.incrementOrdersCancelled).toHaveBeenCalledWith(
          CancelReason.USER_REQUESTED,
        );
        expect(amqp.publish).toHaveBeenCalledWith(
          Exchanges.ORDERS,
          RoutingKeys.ORDER_CANCELLED,
          expect.objectContaining({
            payload: expect.objectContaining({
              orderId: 'o',
              reason: CancelReason.USER_REQUESTED,
            }),
          }),
          expect.anything(),
        );
      },
    );

    it('throws a retryable error when the order does not exist yet', async () => {
      await expect(service.cancelByUser('missing')).rejects.toBeInstanceOf(
        OrderNotFoundYetError,
      );
    });

    it('republishes without counting again when already cancelled', async () => {
      fake.seed('o', OrderStatus.CANCELLED);

      await service.cancelByUser('o');

      expect(amqp.publish).toHaveBeenCalledTimes(1);
      expect(metrics.incrementOrdersCancelled).not.toHaveBeenCalled();
    });

    it('skips a FAILED order', async () => {
      fake.seed('o', OrderStatus.FAILED);

      await service.cancelByUser('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.FAILED);
      expect(amqp.publish).not.toHaveBeenCalled();
    });
  });

  describe('cancelByPaymentDeclined', () => {
    it('moves PENDING_PAYMENT to FAILED', async () => {
      fake.seed('o', OrderStatus.PENDING_PAYMENT);

      await service.cancelByPaymentDeclined('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.FAILED);
      expect(amqp.publish).toHaveBeenCalledTimes(1);
    });

    it('never marks a PAID order as FAILED', async () => {
      fake.seed('o', OrderStatus.PAID);

      await service.cancelByPaymentDeclined('o');

      expect(fake.orders.get('o')?.status).toBe(OrderStatus.PAID);
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('ignores an unknown order', async () => {
      await expect(
        service.cancelByPaymentDeclined('missing'),
      ).resolves.toBeUndefined();
    });
  });
});
