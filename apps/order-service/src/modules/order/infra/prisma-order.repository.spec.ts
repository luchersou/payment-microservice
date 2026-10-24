import { OutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import { CancelReason } from '@contracts/order-events';

import { Order, OrderProps } from '../domain/order';
import { OrderStatus } from '../domain/order-status';
import { PrismaOrderRepository } from './prisma-order.repository';

jest.mock('@order/prisma/prisma.service', () => ({ PrismaService: class {} }));

/** Just enough of Prisma, with a transaction that rolls back on error */
function makeFakePrisma() {
  const rows = new Map<string, OrderProps>();
  const outbox: OutboxRecord[] = [];

  const order = {
    findUnique: jest.fn(({ where }: { where: { id: string } }) =>
      Promise.resolve(rows.get(where.id) ?? null),
    ),
    create: jest.fn(({ data }: { data: OrderProps }) => {
      if (rows.has(data.id)) {
        return Promise.reject(
          Object.assign(new Error('Unique'), { code: 'P2002' }),
        );
      }
      rows.set(data.id, { ...data });
      return Promise.resolve({ ...data });
    }),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string; status: OrderStatus };
        data: { status: OrderStatus };
      }) => {
        const row = rows.get(where.id);
        if (!row || row.status !== where.status) {
          return Promise.resolve({ count: 0 });
        }
        rows.set(where.id, { ...row, ...data });
        return Promise.resolve({ count: 1 });
      },
    ),
  };
  const outboxMessage = {
    create: jest.fn(({ data }: { data: OutboxRecord }) => {
      outbox.push(data);
      return Promise.resolve(data);
    }),
  };
  const client = { order, outboxMessage };

  const prisma = {
    ...client,
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = new Map(rows);
      const outboxLength = outbox.length;
      try {
        return await fn(client);
      } catch (error) {
        rows.clear();
        snapshot.forEach((value, key) => rows.set(key, value));
        outbox.length = outboxLength;
        throw error;
      }
    }),
  };

  return { prisma, rows, outbox };
}

describe('PrismaOrderRepository', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let repository: PrismaOrderRepository;

  beforeEach(() => {
    fake = makeFakePrisma();
    repository = new PrismaOrderRepository(fake.prisma as never);
  });

  it('creates the order together with OrderCreated in the outbox', async () => {
    await expect(repository.create(Order.create('o', 'u', 100))).resolves.toBe(
      true,
    );

    expect(fake.rows.get('o')?.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(fake.outbox).toEqual([
      expect.objectContaining({
        exchange: Exchanges.ORDERS,
        routingKey: RoutingKeys.ORDER_CREATED,
        payload: expect.objectContaining({
          payload: { orderId: 'o', userId: 'u', totalCents: 100 },
        }),
      }),
    ]);
  });

  it('returns false, writing nothing, when the id is taken', async () => {
    await repository.create(Order.cancelledTombstone('o'));

    await expect(repository.create(Order.create('o', 'u', 100))).resolves.toBe(
      false,
    );

    expect(fake.rows.get('o')?.status).toBe(OrderStatus.CANCELLED);
    expect(fake.outbox.map((r) => r.routingKey)).toEqual([
      RoutingKeys.ORDER_CANCELLED,
    ]);
  });

  it('rolls the order back when its event cannot be written', async () => {
    fake.prisma.outboxMessage.create.mockRejectedValueOnce(
      new Error('db down'),
    );

    await expect(
      repository.create(Order.create('o', 'u', 100)),
    ).rejects.toThrow('db down');

    expect(fake.rows.size).toBe(0);
  });

  it('saves a cancel with OrderCancelled, as a user cancel', async () => {
    fake.rows.set('o', {
      id: 'o',
      userId: 'u',
      totalCents: 100,
      status: OrderStatus.PAID,
    });
    const order = (await repository.findById('o'))!;
    order.cancel();

    await expect(repository.save(order)).resolves.toBe(true);

    expect(fake.rows.get('o')?.status).toBe(OrderStatus.CANCELLED);
    expect(fake.outbox).toEqual([
      expect.objectContaining({
        routingKey: RoutingKeys.ORDER_CANCELLED,
        payload: expect.objectContaining({
          payload: expect.objectContaining({
            orderId: 'o',
            reason: CancelReason.USER_REQUESTED,
          }),
        }),
      }),
    ]);
  });

  it('saves nothing when the order changed since it was read', async () => {
    fake.rows.set('o', {
      id: 'o',
      userId: 'u',
      totalCents: 100,
      status: OrderStatus.PENDING_PAYMENT,
    });
    const order = (await repository.findById('o'))!;
    fake.rows.get('o')!.status = OrderStatus.CANCELLED;
    order.markPaid();

    await expect(repository.save(order)).resolves.toBe(false);

    expect(fake.rows.get('o')?.status).toBe(OrderStatus.CANCELLED);
  });
});
