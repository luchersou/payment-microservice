import { OutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';

import { Payment } from '../domain/payment';
import { PaymentStatus } from '../domain/payment-status';
import { PrismaPaymentRepository } from './prisma-payment.repository';

jest.mock('@payment/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

type Row = {
  id: string;
  orderId: string;
  amountCents: number | null;
  status: PaymentStatus;
  failureReason: string | null;
};

/** Just enough of Prisma, with a transaction that rolls back on error */
function makeFakePrisma() {
  const rows = new Map<string, Row>();
  const outbox: OutboxRecord[] = [];
  let seq = 0;

  const payment = {
    create: jest.fn(
      ({ data }: { data: Partial<Row> & { orderId: string } }) => {
        if ([...rows.values()].some((r) => r.orderId === data.orderId)) {
          return Promise.reject(
            Object.assign(new Error('Unique'), { code: 'P2002' }),
          );
        }
        const row: Row = {
          id: `pay-${++seq}`,
          amountCents: null,
          failureReason: null,
          status: PaymentStatus.PROCESSING,
          ...data,
        };
        rows.set(row.id, row);
        return Promise.resolve({ ...row });
      },
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string; status: PaymentStatus };
        data: Partial<Row>;
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
  const client = { payment, outboxMessage };

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

describe('PrismaPaymentRepository', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let repository: PrismaPaymentRepository;

  beforeEach(() => {
    fake = makeFakePrisma();
    repository = new PrismaPaymentRepository(fake.prisma as never);
  });

  const processing = async () =>
    (await repository.createProcessing('order-1', 100))!;

  it('returns null instead of a duplicate when the order already has a payment', async () => {
    await processing();

    await expect(repository.createProcessing('order-1', 100)).resolves.toBe(
      null,
    );
    await expect(
      repository.createCancelledTombstone('order-1'),
    ).resolves.toBeNull();
  });

  it('saves the new status and its event to the outbox together', async () => {
    const payment = await processing();
    payment.decline('No funds');

    await expect(repository.save(payment)).resolves.toBe(true);

    expect(fake.rows.get(payment.id)).toMatchObject({
      status: PaymentStatus.DECLINED,
      failureReason: 'No funds',
    });
    expect(fake.outbox).toEqual([
      expect.objectContaining({
        exchange: Exchanges.PAYMENTS,
        routingKey: RoutingKeys.PAYMENT_DECLINED,
        payload: expect.objectContaining({
          payload: { orderId: 'order-1', reason: 'No funds' },
        }),
      }),
    ]);
  });

  it('writes payment.refunded when a refund is saved', async () => {
    const payment = await processing();
    fake.rows.get(payment.id)!.status = PaymentStatus.APPROVED;
    const approved = Payment.fromProps({
      ...fake.rows.get(payment.id)!,
    });
    approved.refund();

    await repository.save(approved);

    expect(fake.outbox).toEqual([
      expect.objectContaining({
        exchange: Exchanges.PAYMENTS,
        routingKey: RoutingKeys.PAYMENT_REFUNDED,
        payload: expect.objectContaining({
          payload: { orderId: 'order-1', transactionId: payment.id },
        }),
      }),
    ]);
  });

  it('saves nothing when the payment changed since it was read', async () => {
    const payment = await processing();
    fake.rows.get(payment.id)!.status = PaymentStatus.CANCELLED;
    payment.approve();

    await expect(repository.save(payment)).resolves.toBe(false);

    expect(fake.rows.get(payment.id)?.status).toBe(PaymentStatus.CANCELLED);
    expect(fake.outbox).toHaveLength(0);
  });

  it('rolls the status back when the event cannot be written', async () => {
    const payment = await processing();
    fake.prisma.outboxMessage.create.mockRejectedValueOnce(
      new Error('db down'),
    );
    payment.approve();

    await expect(repository.save(payment)).rejects.toThrow('db down');

    expect(fake.rows.get(payment.id)?.status).toBe(PaymentStatus.PROCESSING);
  });

  it('maps rows to domain payments', async () => {
    const tombstone = await repository.createCancelledTombstone('order-2');

    expect(tombstone).toBeInstanceOf(Payment);
    expect(tombstone).toMatchObject({
      orderId: 'order-2',
      status: PaymentStatus.CANCELLED,
      amountCents: null,
      mayHaveBeenCharged: false,
    });
  });
});
