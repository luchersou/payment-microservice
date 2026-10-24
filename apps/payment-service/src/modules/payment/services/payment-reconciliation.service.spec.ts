import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';

import { CorrelationIdService } from '@common/context';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { PaymentService } from './payment.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';

jest.mock('@payment/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

describe('PaymentReconciliationService', () => {
  const stuck = [
    { id: 'pay-1', orderId: 'o-1', status: PaymentStatus.PROCESSING },
    { id: 'pay-2', orderId: 'o-2', status: PaymentStatus.PROCESSING },
  ];

  let prisma: { payment: { findMany: jest.Mock } };
  let paymentService: { resumePayment: jest.Mock };
  let metrics: { incrementPaymentsReconciled: jest.Mock };
  let service: PaymentReconciliationService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-01T12:00:00Z'));
    prisma = { payment: { findMany: jest.fn().mockResolvedValue(stuck) } };
    paymentService = { resumePayment: jest.fn().mockResolvedValue(undefined) };
    metrics = { incrementPaymentsReconciled: jest.fn() };
    service = new PaymentReconciliationService(
      prisma as never,
      paymentService as unknown as PaymentService,
      metrics as unknown as PaymentMetricsService,
      {} as SchedulerRegistry,
      new ConfigService({ RECONCILIATION_STUCK_AFTER_MINUTES: 10 }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('only looks at PROCESSING payments untouched for longer than the threshold', async () => {
    await service.reconcile();

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: PaymentStatus.PROCESSING,
          updatedAt: { lt: new Date('2026-01-01T11:50:00Z') },
        },
      }),
    );
  });

  it('resumes each stuck payment under its own correlationId', async () => {
    const ids: (string | undefined)[] = [];
    paymentService.resumePayment.mockImplementation(() => {
      ids.push(CorrelationIdService.getId());
      return Promise.resolve();
    });

    await expect(service.reconcile()).resolves.toBe(2);

    expect(paymentService.resumePayment).toHaveBeenCalledWith(stuck[0]);
    expect(paymentService.resumePayment).toHaveBeenCalledWith(stuck[1]);
    expect(ids[0]).toMatch(/^reconcile-/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(metrics.incrementPaymentsReconciled).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one payment fails to resume', async () => {
    paymentService.resumePayment.mockRejectedValueOnce(new Error('db down'));

    await expect(service.reconcile()).resolves.toBe(1);

    expect(paymentService.resumePayment).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the query fails', async () => {
    prisma.payment.findMany.mockRejectedValue(new Error('db down'));

    await expect(service.reconcile()).resolves.toBe(0);
  });
});
