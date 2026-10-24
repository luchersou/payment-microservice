import { CancelReason } from '@contracts/order-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { PaymentStatus } from '../domain/payment-status';
import { PaymentGateway } from '../domain/ports/payment-gateway';
import {
  CancelPaymentUseCase,
  ConcurrentPaymentUpdateError,
} from './cancel-payment.use-case';
import { ProcessPaymentUseCase } from './process-payment.use-case';
import { InMemoryPaymentRepository } from './testing/in-memory-payment.repository';
import { makeGateway, makeMetrics } from './testing/test-doubles';

describe('CancelPaymentUseCase', () => {
  let payments: InMemoryPaymentRepository;
  let gateway: ReturnType<typeof makeGateway>;
  let metrics: ReturnType<typeof makeMetrics>;
  let useCase: CancelPaymentUseCase;

  const cancelled = {
    orderId: 'order-1',
    reason: CancelReason.USER_REQUESTED,
    cancelledAt: new Date(),
  };
  const status = () => payments.stored('order-1')?.status;

  beforeEach(() => {
    payments = new InMemoryPaymentRepository();
    gateway = makeGateway();
    metrics = makeMetrics();
    useCase = new CancelPaymentUseCase(
      payments,
      gateway as PaymentGateway,
      metrics as unknown as PaymentMetricsService,
    );
  });

  it('refunds an APPROVED payment through the gateway', async () => {
    const approved = payments.seed('order-1', PaymentStatus.APPROVED);

    await useCase.execute(cancelled);

    expect(gateway.refund).toHaveBeenCalledWith(approved.id);
    expect(status()).toBe(PaymentStatus.REFUNDED);
    expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
  });

  it('keeps the payment APPROVED when the refund fails, so the retry refunds it', async () => {
    payments.seed('order-1', PaymentStatus.APPROVED);
    gateway.refund.mockRejectedValueOnce(new Error('provider down'));

    await expect(useCase.execute(cancelled)).rejects.toThrow('provider down');

    expect(status()).toBe(PaymentStatus.APPROVED);
    expect(metrics.incrementPaymentsRefunded).not.toHaveBeenCalled();
  });

  it('cancels a PROCESSING payment', async () => {
    payments.seed('order-1', PaymentStatus.PROCESSING);

    await useCase.execute(cancelled);

    expect(status()).toBe(PaymentStatus.CANCELLED);
    expect(metrics.incrementPaymentsCancelled).toHaveBeenCalledTimes(1);
    expect(metrics.incrementPaymentsDeclined).not.toHaveBeenCalled();
  });

  it.each([
    PaymentStatus.DECLINED,
    PaymentStatus.FAILED,
    PaymentStatus.REFUNDED,
    PaymentStatus.CANCELLED,
  ])('leaves a %s payment untouched', async (final) => {
    payments.seed('order-1', final);

    await useCase.execute(cancelled);

    expect(status()).toBe(final);
    expect(gateway.refund).not.toHaveBeenCalled();
  });

  it('writes a CANCELLED tombstone when the payment does not exist yet', async () => {
    await useCase.execute(cancelled);

    expect(payments.stored('order-1')).toMatchObject({
      status: PaymentStatus.CANCELLED,
      amountCents: null,
    });
    expect(metrics.incrementPaymentsCancelled).toHaveBeenCalledTimes(1);
    expect(payments.events).toHaveLength(0);
  });

  it('never charges an order whose OrderCreated arrives after the cancel', async () => {
    const processPayment = new ProcessPaymentUseCase(
      payments,
      gateway as PaymentGateway,
      metrics as unknown as PaymentMetricsService,
    );

    await useCase.execute(cancelled);
    await processPayment.execute({
      orderId: 'order-1',
      userId: 'user-1',
      totalCents: 100,
    });

    expect(gateway.charge).not.toHaveBeenCalled();
    expect(payments.size).toBe(1);
    expect(status()).toBe(PaymentStatus.CANCELLED);
  });

  it('cancels the payment OrderCreated created between the read and the tombstone write', async () => {
    payments.seed('order-1', PaymentStatus.PROCESSING);
    jest.spyOn(payments, 'findByOrderId').mockResolvedValueOnce(null);

    await useCase.execute(cancelled);

    expect(payments.size).toBe(1);
    expect(status()).toBe(PaymentStatus.CANCELLED);
  });

  it('throws a retryable error when the status changed concurrently', async () => {
    payments.seed('order-1', PaymentStatus.PROCESSING);
    jest.spyOn(payments, 'save').mockResolvedValueOnce(false);

    await expect(useCase.execute(cancelled)).rejects.toBeInstanceOf(
      ConcurrentPaymentUpdateError,
    );
  });
});
