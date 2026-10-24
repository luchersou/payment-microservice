import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { CorrelationIdService } from '@common/context';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { PaymentRepository } from '../domain/ports/payment.repository';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { ProcessPaymentUseCase } from './process-payment.use-case';

describe('PaymentReconciliationService', () => {
  const stuck = [{ id: 'pay-1' }, { id: 'pay-2' }];

  let payments: { findStuckProcessing: jest.Mock };
  let processPayment: { resume: jest.Mock };
  let metrics: { incrementPaymentsReconciled: jest.Mock };
  let service: PaymentReconciliationService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-01T12:00:00Z'));
    payments = { findStuckProcessing: jest.fn().mockResolvedValue(stuck) };
    processPayment = { resume: jest.fn().mockResolvedValue(undefined) };
    metrics = { incrementPaymentsReconciled: jest.fn() };
    service = new PaymentReconciliationService(
      payments as unknown as PaymentRepository,
      processPayment as unknown as ProcessPaymentUseCase,
      metrics as unknown as PaymentMetricsService,
      {} as SchedulerRegistry,
      new ConfigService({ RECONCILIATION_STUCK_AFTER_MINUTES: 10 }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('only looks at payments untouched for longer than the threshold', async () => {
    await service.reconcile();

    expect(payments.findStuckProcessing).toHaveBeenCalledWith(
      new Date('2026-01-01T11:50:00Z'),
      50,
    );
  });

  it('resumes each stuck payment under its own correlationId', async () => {
    const ids: (string | undefined)[] = [];
    processPayment.resume.mockImplementation(() => {
      ids.push(CorrelationIdService.getId());
      return Promise.resolve();
    });

    await expect(service.reconcile()).resolves.toBe(2);

    expect(processPayment.resume).toHaveBeenCalledWith(stuck[0]);
    expect(processPayment.resume).toHaveBeenCalledWith(stuck[1]);
    expect(ids[0]).toMatch(/^reconcile-/);
    expect(ids[0]).not.toBe(ids[1]);
    expect(metrics.incrementPaymentsReconciled).toHaveBeenCalledTimes(2);
  });

  it('keeps going when one payment fails to resume', async () => {
    processPayment.resume.mockRejectedValueOnce(new Error('db down'));

    await expect(service.reconcile()).resolves.toBe(1);

    expect(processPayment.resume).toHaveBeenCalledTimes(2);
  });

  it('does not throw when the query fails', async () => {
    payments.findStuckProcessing.mockRejectedValue(new Error('db down'));

    await expect(service.reconcile()).resolves.toBe(0);
  });
});
