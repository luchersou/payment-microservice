import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';

import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import { CancelReason } from '@contracts/order-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
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

  return { prisma: { payment }, payments, byOrder, seed };
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
  let amqp: { publish: jest.Mock };
  let metrics: ReturnType<typeof makeMetrics>;
  let service: PaymentService;
  let gateway: jest.SpyInstance;

  const orderCreated = { orderId: 'order-1', userId: 'user-1', total: 100 };

  beforeEach(() => {
    fake = makeFakePrisma();
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    metrics = makeMetrics();
    service = new PaymentService(
      fake.prisma as never,
      amqp as unknown as AmqpConnection,
      metrics as unknown as PaymentMetricsService,
    );
    gateway = jest
      .spyOn(service as never, 'simulatePaymentGateway')
      .mockResolvedValue({ approved: true } as never);
  });

  const publishedRoutingKeys = () =>
    amqp.publish.mock.calls.map((call: unknown[]) => call[1]);

  const publishedPayload = () =>
    (amqp.publish.mock.calls[0][2] as { payload: unknown }).payload;

  describe('handleOrderCreated', () => {
    it('approves and publishes PaymentApproved', async () => {
      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.APPROVED);
      expect(amqp.publish).toHaveBeenCalledWith(
        Exchanges.PAYMENTS,
        RoutingKeys.PAYMENT_APPROVED,
        expect.objectContaining({
          payload: expect.objectContaining({ orderId: 'order-1' }),
        }),
        expect.objectContaining({ persistent: true }),
      );
    });

    it('declines and publishes PaymentDeclined', async () => {
      gateway.mockResolvedValue({
        approved: false,
        reason: 'No funds',
      } as never);

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.DECLINED);
      expect(fake.byOrder('order-1')?.failureReason).toBe('No funds');
      expect(publishedRoutingKeys()).toEqual([RoutingKeys.PAYMENT_DECLINED]);
      expect(publishedPayload()).toEqual({
        orderId: 'order-1',
        reason: 'No funds',
      });
    });

    it('marks FAILED only on gateway errors', async () => {
      gateway.mockRejectedValue(new Error('gateway timeout') as never);

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.FAILED);
      expect(fake.byOrder('order-1')?.failureReason).toBe('gateway timeout');
      expect(publishedRoutingKeys()).toEqual([RoutingKeys.PAYMENT_FAILED]);
      expect(publishedPayload()).toEqual({
        orderId: 'order-1',
        error: 'gateway timeout',
      });
    });

    it('republishes a DECLINED result with the persisted reason', async () => {
      fake.seed('order-1', PaymentStatus.DECLINED, {
        failureReason: 'Card expired',
      });

      await service.handleOrderCreated(orderCreated);

      expect(gateway).not.toHaveBeenCalled();
      expect(publishedPayload()).toEqual({
        orderId: 'order-1',
        reason: 'Card expired',
      });
    });

    it('republishes a FAILED result with the persisted reason', async () => {
      fake.seed('order-1', PaymentStatus.FAILED, {
        failureReason: 'gateway timeout',
      });

      await service.handleOrderCreated(orderCreated);

      expect(gateway).not.toHaveBeenCalled();
      expect(publishedPayload()).toEqual({
        orderId: 'order-1',
        error: 'gateway timeout',
      });
    });

    it('keeps APPROVED and rethrows when publishing the result fails', async () => {
      amqp.publish.mockRejectedValueOnce(new Error('broker down'));

      await expect(service.handleOrderCreated(orderCreated)).rejects.toThrow(
        'broker down',
      );

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.APPROVED);
      expect(metrics.incrementPaymentsFailed).not.toHaveBeenCalled();
    });

    it('republishes the decided result on redelivery without charging again', async () => {
      fake.seed('order-1', PaymentStatus.APPROVED);

      await service.handleOrderCreated(orderCreated);

      expect(gateway).not.toHaveBeenCalled();
      expect(publishedRoutingKeys()).toEqual([RoutingKeys.PAYMENT_APPROVED]);
    });

    it('resumes a payment stuck in PROCESSING', async () => {
      fake.seed('order-1', PaymentStatus.PROCESSING);

      await service.handleOrderCreated(orderCreated);

      expect(gateway).toHaveBeenCalledTimes(1);
      expect(fake.payments.size).toBe(1);
      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.APPROVED);
    });

    it.each([PaymentStatus.REFUNDED, PaymentStatus.CANCELLED])(
      'does not charge nor publish for a %s payment',
      async (status) => {
        fake.seed('order-1', status);

        await service.handleOrderCreated(orderCreated);

        expect(gateway).not.toHaveBeenCalled();
        expect(amqp.publish).not.toHaveBeenCalled();
        expect(fake.byOrder('order-1')?.status).toBe(status);
      },
    );

    it('does not approve if the order was cancelled during the gateway call', async () => {
      gateway.mockImplementation(() => {
        const current = fake.byOrder('order-1')!;
        fake.payments.set(current.id, {
          ...current,
          status: PaymentStatus.CANCELLED,
        });
        return Promise.resolve({ approved: true });
      });

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.CANCELLED);
      expect(amqp.publish).not.toHaveBeenCalled();
      expect(metrics.incrementPaymentsApproved).not.toHaveBeenCalled();
    });
  });

  describe('handleOrderCancelled', () => {
    const cancelled = {
      orderId: 'order-1',
      reason: CancelReason.USER_REQUESTED,
      cancelledAt: new Date(),
    };

    it('refunds an APPROVED payment', async () => {
      fake.seed('order-1', PaymentStatus.APPROVED);

      await service.handleOrderCancelled(cancelled);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.REFUNDED);
      expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
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
      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('never charges an order whose OrderCreated arrives after the cancel', async () => {
      await service.handleOrderCancelled(cancelled);
      await service.handleOrderCreated(orderCreated);

      expect(gateway).not.toHaveBeenCalled();
      expect(amqp.publish).not.toHaveBeenCalled();
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
