import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';

import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import { CancelReason } from '@contracts/order-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import {
  ConcurrentPaymentUpdateError,
  PaymentNotFoundYetError,
  PaymentService,
} from './payment.service';

jest.mock('@payment/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

type FakePayment = {
  id: string;
  orderId: string;
  amount: number;
  status: PaymentStatus;
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
        data: { status: PaymentStatus };
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

  const seed = (orderId: string, status: PaymentStatus) => {
    const p = {
      id: `pay-${++seq}`,
      orderId,
      amount: 100,
      status,
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
        expect.anything(),
      );
    });

    it('declines and publishes PaymentDeclined', async () => {
      gateway.mockResolvedValue({
        approved: false,
        reason: 'No funds',
      } as never);

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.DECLINED);
      expect(publishedRoutingKeys()).toEqual([RoutingKeys.PAYMENT_DECLINED]);
    });

    it('marks FAILED only on gateway errors', async () => {
      gateway.mockRejectedValue(new Error('gateway timeout') as never);

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.FAILED);
      expect(publishedRoutingKeys()).toEqual([RoutingKeys.PAYMENT_FAILED]);
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

    it('does not publish for a REFUNDED payment', async () => {
      fake.seed('order-1', PaymentStatus.REFUNDED);

      await service.handleOrderCreated(orderCreated);

      expect(amqp.publish).not.toHaveBeenCalled();
    });

    it('does not approve if the order was cancelled during the gateway call', async () => {
      gateway.mockImplementation(() => {
        const current = fake.byOrder('order-1')!;
        fake.payments.set(current.id, {
          ...current,
          status: PaymentStatus.DECLINED,
        });
        return Promise.resolve({ approved: true });
      });

      await service.handleOrderCreated(orderCreated);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.DECLINED);
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

    it('declines a PROCESSING payment', async () => {
      fake.seed('order-1', PaymentStatus.PROCESSING);

      await service.handleOrderCancelled(cancelled);

      expect(fake.byOrder('order-1')?.status).toBe(PaymentStatus.DECLINED);
    });

    it.each([
      PaymentStatus.DECLINED,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
    ])('leaves a %s payment untouched', async (status) => {
      fake.seed('order-1', status);

      await service.handleOrderCancelled(cancelled);

      expect(fake.byOrder('order-1')?.status).toBe(status);
      expect(fake.prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('throws a retryable error when the payment does not exist yet', async () => {
      await expect(
        service.handleOrderCancelled(cancelled),
      ).rejects.toBeInstanceOf(PaymentNotFoundYetError);
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
