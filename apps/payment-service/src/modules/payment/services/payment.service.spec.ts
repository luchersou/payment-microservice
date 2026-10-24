import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';

import { OutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import { CancelReason } from '@contracts/order-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { ChargeResult, PaymentGateway } from '../domain/ports/payment-gateway';
import {
  ConcurrentPaymentUpdateError,
  PaymentService,
} from './payment.service';

jest.mock('@payment/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

type FakePayment = {
  id: string;
  orderId: string;
  amount?: number | null;
  status: PaymentStatus;
  failureReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function makeFakePrisma() {
  const payments = new Map<string, FakePayment>();
  const byOrder = (orderId: string) =>
    [...payments.values()].find((p) => p.orderId === orderId);
  let seq = 0;

  const payment = {
    create: jest.fn(
      ({
        data,
      }: {
        data: Pick<FakePayment, 'orderId' | 'amount' | 'status'>;
      }) => {
        if (byOrder(data.orderId)) {
          return Promise.reject(
            Object.assign(new Error('Unique'), { code: 'P2002' }),
          );
        }
        const now = new Date();
        const created = {
          id: `pay-${++seq}`,
          ...data,
          createdAt: now,
          updatedAt: now,
        };
        payments.set(created.id, created);
        return Promise.resolve({ ...created });
      },
    ),
    findUnique: jest.fn(({ where }: { where: { orderId: string } }) => {
      const found = byOrder(where.orderId);
      return Promise.resolve(found ? { ...found } : null);
    }),
    findUniqueOrThrow: jest.fn(({ where }: { where: { orderId: string } }) =>
      Promise.resolve({ ...byOrder(where.orderId)! }),
    ),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string; status: PaymentStatus };
        data: { status: PaymentStatus; failureReason?: string };
      }) => {
        const current = payments.get(where.id);
        if (!current || current.status !== where.status) {
          return Promise.resolve({ count: 0 });
        }
        payments.set(where.id, { ...current, ...data });
        return Promise.resolve({ count: 1 });
      },
    ),
  };

  const seed = (
    orderId: string,
    status: PaymentStatus,
    extra: Partial<FakePayment> = {},
  ) => {
    const p = {
      id: `pay-${++seq}`,
      orderId,
      amount: 100,
      status,
      ...extra,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    payments.set(p.id, p);
    return p;
  };

  const outbox: OutboxRecord[] = [];
  const outboxMessage = {
    create: jest.fn(({ data }: { data: OutboxRecord }) => {
      outbox.push(data);
      return Promise.resolve(data);
    }),
  };

  const client = { payment, outboxMessage };
  const prisma = {
    ...client,
    // Runs on the same fake, restoring it if the callback throws (rollback)
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = new Map(payments);
      const outboxLength = outbox.length;
      try {
        return await fn(client);
      } catch (error) {
        payments.clear();
        snapshot.forEach((value, key) => payments.set(key, value));
        outbox.length = outboxLength;
        throw error;
      }
    }),
  };

  return { prisma, payments, outbox, byOrder, seed };
}

/** Deterministic gateway: approves unless a test says otherwise */
function makeGateway() {
  return {
    charge: jest
      .fn<Promise<ChargeResult>, [string, number]>()
      .mockResolvedValue({ status: 'approved' }),
    refund: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
  };
}

function makeMetrics() {
  return {
    startMessageProcessingTimer: jest.fn(() => jest.fn()),
    incrementPaymentsApproved: jest.fn(),
    incrementPaymentsDeclined: jest.fn(),
    incrementPaymentsFailed: jest.fn(),
    incrementPaymentsRefunded: jest.fn(),
    incrementPaymentsCancelled: jest.fn(),
  };
}

describe('PaymentService', () => {
  let fake: ReturnType<typeof makeFakePrisma>;
  let metrics: ReturnType<typeof makeMetrics>;
  let service: PaymentService;
  let gateway: ReturnType<typeof makeGateway>;

  const orderCreated = { orderId: 'order-1', userId: 'user-1', total: 100 };

  beforeEach(() => {
    fake = makeFakePrisma();
    metrics = makeMetrics();
    gateway = makeGateway();
    service = new PaymentService(
      fake.prisma as never,
      metrics as unknown as PaymentMetricsService,
      gateway as PaymentGateway,
    );
  });

  const outboxRoutingKeys = () => fake.outbox.map((r) => r.routingKey);

  const outboxPayload = () => fake.outbox[0].payload.payload;

  describe('handleOrderCreated', () => {
    it('approves and writes PaymentApproved to the outbox', async () => {
      await service.handleOrderCreated(orderCreated);

      const payment = fake.byOrder('order-1')!;
      expect(gateway.charge).toHaveBeenCalledWith(payment.id, 100);
      expect(payment.status).toBe(PaymentStatus.APPROVED);
      expect(fake.outbox).toEqual([
        expect.objectContaining({
          exchange: Exchanges.PAYMENTS,
          routingKey: RoutingKeys.PAYMENT_APPROVED,
          payload: expect.objectContaining({
            payload: expect.objectContaining({ orderId: 'order-1' }),
          }),
        }),
      ]);
    });

    it('declines and publishes PaymentDeclined', async () => {
      gateway.charge.mockResolvedValue({
        status: 'declined',
        reason: 'No funds',
      });

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.DECLINED);
      expect(fake.byOrder('order-1')?.failureReason).toBe('No funds');
      expect(outboxRoutingKeys()).toEqual([RoutingKeys.PAYMENT_DECLINED]);
      expect(outboxPayload()).toEqual({
        orderId: 'order-1',
        reason: 'No funds',
      });
    });

    it('marks FAILED only on gateway errors', async () => {
      gateway.charge.mockRejectedValue(new Error('gateway timeout'));

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.FAILED);
      expect(fake.byOrder('order-1')?.failureReason).toBe('gateway timeout');
      expect(outboxRoutingKeys()).toEqual([RoutingKeys.PAYMENT_FAILED]);
      expect(outboxPayload()).toEqual({
        orderId: 'order-1',
        error: 'gateway timeout',
      });
    });

    it('rolls the decision back with its event, so the retry resumes the payment', async () => {
      fake.prisma.outboxMessage.create.mockRejectedValueOnce(
        new Error('db down'),
      );

      await expect(service.handleOrderCreated(orderCreated)).rejects.toThrow(
        'db down',
      );
      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.PROCESSING);
      expect(fake.outbox).toHaveLength(0);

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.APPROVED);
      expect(outboxRoutingKeys()).toEqual([RoutingKeys.PAYMENT_APPROVED]);
    });

    it.each([
      PaymentStatus.APPROVED,
      PaymentStatus.DECLINED,
      PaymentStatus.FAILED,
    ])(
      'does nothing on redelivery for a %s payment (its event is already in the outbox)',
      async (status) => {
        fake.seed('order-1', status);

        await service.handleOrderCreated(orderCreated);

        expect(gateway.charge).not.toHaveBeenCalled();
        expect(fake.outbox).toHaveLength(0);
      },
    );

    it('resumes a payment stuck in PROCESSING', async () => {
      fake.seed('order-1', PaymentStatus.PROCESSING);

      await service.handleOrderCreated(orderCreated);

      expect(gateway.charge).toHaveBeenCalledTimes(1);
      expect(fake.payments.size).toBe(1);
      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.APPROVED);
    });

    it.each([PaymentStatus.REFUNDED, PaymentStatus.CANCELLED])(
      'does not charge nor write an event for a %s payment',
      async (status) => {
        fake.seed('order-1', status);

        await service.handleOrderCreated(orderCreated);

        expect(gateway.charge).not.toHaveBeenCalled();
        expect(fake.outbox).toHaveLength(0);
        expect(fake.byOrder('order-1')?.status).toBe(status);
      },
    );

    it('does not approve if the order was cancelled during the gateway call', async () => {
      gateway.charge.mockImplementation(() => {
        const current = fake.byOrder('order-1')!;
        fake.payments.set(current.id, {
          ...current,
          status: PaymentStatus.CANCELLED,
        });
        return Promise.resolve({ status: 'approved' });
      });

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.CANCELLED);
      expect(fake.outbox).toHaveLength(0);
      expect(metrics.incrementPaymentsApproved).not.toHaveBeenCalled();
    });

    it('refunds the charge when the cancel wins the race against the approval', async () => {
      gateway.charge.mockImplementation((paymentId: string) => {
        fake.payments.set(paymentId, {
          ...fake.payments.get(paymentId)!,
          status: PaymentStatus.CANCELLED,
        });
        return Promise.resolve({ status: 'approved' });
      });

      await service.handleOrderCreated(orderCreated);

      const payment = fake.byOrder('order-1')!;
      expect(gateway.refund).toHaveBeenCalledWith(payment.id);
      expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(fake.outbox).toHaveLength(0);
    });

    it('retries a failed refund of a lost approval on redelivery', async () => {
      gateway.charge.mockImplementation((paymentId: string) => {
        fake.payments.set(paymentId, {
          ...fake.payments.get(paymentId)!,
          status: PaymentStatus.CANCELLED,
        });
        return Promise.resolve({ status: 'approved' });
      });
      gateway.refund.mockRejectedValueOnce(new Error('provider down'));

      await expect(service.handleOrderCreated(orderCreated)).rejects.toThrow(
        'provider down',
      );
      await service.handleOrderCreated(orderCreated);

      expect(gateway.charge).toHaveBeenCalledTimes(1);
      expect(gateway.refund).toHaveBeenCalledTimes(2);
      expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
    });

    it('does not count a refund when the cancelled payment was never charged', async () => {
      fake.seed('order-1', PaymentStatus.CANCELLED);
      gateway.refund.mockResolvedValue(false);

      await service.handleOrderCreated(orderCreated);

      expect(gateway.charge).not.toHaveBeenCalled();
      expect(metrics.incrementPaymentsRefunded).not.toHaveBeenCalled();
    });

    it('does not call the gateway at all for a tombstone (no amount)', async () => {
      fake.seed('order-1', PaymentStatus.CANCELLED, { amount: null });

      await service.handleOrderCreated(orderCreated);

      expect(gateway.charge).not.toHaveBeenCalled();
      expect(gateway.refund).not.toHaveBeenCalled();
    });
  });

  describe('resumePayment (reconciliation)', () => {
    it('charges a stuck PROCESSING payment and records its result', async () => {
      const stuck = fake.seed('order-1', PaymentStatus.PROCESSING);

      await service.resumePayment(stuck as never);

      expect(gateway.charge).toHaveBeenCalledTimes(1);
      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.APPROVED);
      expect(outboxRoutingKeys()).toEqual([RoutingKeys.PAYMENT_APPROVED]);
    });

    it('does nothing if a consumer decided the payment in the meantime', async () => {
      const stuck = fake.seed('order-1', PaymentStatus.PROCESSING);
      fake.payments.set(stuck.id, { ...stuck, status: PaymentStatus.DECLINED });

      await service.resumePayment(stuck as never);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.DECLINED);
      expect(fake.outbox).toHaveLength(0);
    });
  });

  describe('handleOrderCancelled', () => {
    const cancelled = {
      orderId: 'order-1',
      reason: CancelReason.USER_REQUESTED,
      cancelledAt: new Date(),
    };

    it('refunds an APPROVED payment through the gateway', async () => {
      const approved = fake.seed('order-1', PaymentStatus.APPROVED);

      await service.handleOrderCancelled(cancelled);

      expect(gateway.refund).toHaveBeenCalledWith(approved.id);
      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.REFUNDED);
      expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
    });

    it('keeps the payment APPROVED when the gateway refund fails, so the retry refunds it', async () => {
      fake.seed('order-1', PaymentStatus.APPROVED);
      gateway.refund.mockRejectedValueOnce(new Error('provider down'));

      await expect(service.handleOrderCancelled(cancelled)).rejects.toThrow(
        'provider down',
      );

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.APPROVED);
      expect(metrics.incrementPaymentsRefunded).not.toHaveBeenCalled();
    });

    it('cancels a PROCESSING payment', async () => {
      fake.seed('order-1', PaymentStatus.PROCESSING);

      await service.handleOrderCancelled(cancelled);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.CANCELLED);
      expect(metrics.incrementPaymentsCancelled).toHaveBeenCalledTimes(1);
      expect(metrics.incrementPaymentsDeclined).not.toHaveBeenCalled();
    });

    it.each([
      PaymentStatus.DECLINED,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
      PaymentStatus.CANCELLED,
    ])('leaves a %s payment untouched', async (status) => {
      fake.seed('order-1', status);

      await service.handleOrderCancelled(cancelled);

      expect(fake.byOrder('order-1')?.status).toBe(status);
      expect(fake.prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('writes a CANCELLED tombstone when the payment does not exist yet', async () => {
      await service.handleOrderCancelled(cancelled);

      const tombstone = fake.byOrder('order-1');
      expect(tombstone?.status).toBe(PaymentStatus.CANCELLED);
      expect(tombstone?.amount).toBeUndefined();
      expect(metrics.incrementPaymentsCancelled).toHaveBeenCalledTimes(1);
      expect(fake.outbox).toHaveLength(0);
    });

    it('never charges an order whose OrderCreated arrives after the cancel', async () => {
      await service.handleOrderCancelled(cancelled);
      await service.handleOrderCreated(orderCreated);

      expect(gateway.charge).not.toHaveBeenCalled();
      expect(fake.outbox).toHaveLength(0);
      expect(fake.payments.size).toBe(1);
      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.CANCELLED);
    });

    it('cancels the payment OrderCreated created between the read and the tombstone write', async () => {
      fake.seed('order-1', PaymentStatus.PROCESSING);
      fake.prisma.payment.findUnique.mockResolvedValueOnce(null);

      await service.handleOrderCancelled(cancelled);

      expect(fake.payments.size).toBe(1);
      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.CANCELLED);
    });

    it('throws a retryable error when the status changed concurrently', async () => {
      fake.seed('order-1', PaymentStatus.PROCESSING);
      fake.prisma.payment.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(
        service.handleOrderCancelled(cancelled),
      ).rejects.toBeInstanceOf(ConcurrentPaymentUpdateError);
    });
  });
});
