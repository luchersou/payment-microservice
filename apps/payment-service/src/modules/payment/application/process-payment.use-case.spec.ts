import { PaymentMetricsService } from '../../metrics/metrics.service';
import { PaymentStatus } from '../domain/payment-status';
import { PaymentGateway } from '../domain/ports/payment-gateway';
import { ProcessPaymentUseCase } from './process-payment.use-case';
import { InMemoryPaymentRepository } from './testing/in-memory-payment.repository';
import { makeGateway, makeMetrics } from './testing/test-doubles';

describe('ProcessPaymentUseCase', () => {
  let payments: InMemoryPaymentRepository;
  let gateway: ReturnType<typeof makeGateway>;
  let metrics: ReturnType<typeof makeMetrics>;
  let useCase: ProcessPaymentUseCase;

  const orderCreated = {
    orderId: 'order-1',
    userId: 'user-1',
    totalCents: 100,
  };
  const status = () => payments.stored('order-1')?.status;
  const eventTypes = () => payments.events.map((e) => e.type);

  /** The order gets cancelled while the gateway is charging */
  const cancelDuringCharge = () =>
    gateway.charge.mockImplementation(() => {
      payments.setStatus('order-1', PaymentStatus.CANCELLED);
      return Promise.resolve({ status: 'approved' });
    });

  beforeEach(() => {
    payments = new InMemoryPaymentRepository();
    gateway = makeGateway();
    metrics = makeMetrics();
    useCase = new ProcessPaymentUseCase(
      payments,
      gateway as PaymentGateway,
      metrics as unknown as PaymentMetricsService,
    );
  });

  describe('execute (OrderCreated)', () => {
    it('charges the amountCents with the paymentId as idempotency key and approves', async () => {
      await useCase.execute(orderCreated);

      const payment = payments.stored('order-1')!;
      expect(gateway.charge).toHaveBeenCalledWith(payment.id, 100);
      expect(payment.status).toBe(PaymentStatus.APPROVED);
      expect(payments.events).toEqual([
        { type: 'PaymentApproved', paymentId: payment.id, orderId: 'order-1' },
      ]);
      expect(metrics.incrementPaymentsApproved).toHaveBeenCalledTimes(1);
    });

    it('declines with the gateway reason', async () => {
      gateway.charge.mockResolvedValue({
        status: 'declined',
        reason: 'No funds',
      });

      await useCase.execute(orderCreated);

      expect(payments.stored('order-1')).toMatchObject({
        status: PaymentStatus.DECLINED,
        failureReason: 'No funds',
      });
      expect(payments.events).toEqual([
        { type: 'PaymentDeclined', orderId: 'order-1', reason: 'No funds' },
      ]);
    });

    it('marks FAILED only on gateway errors', async () => {
      gateway.charge.mockRejectedValue(new Error('gateway timeout'));

      await useCase.execute(orderCreated);

      expect(payments.stored('order-1')).toMatchObject({
        status: PaymentStatus.FAILED,
        failureReason: 'gateway timeout',
      });
      expect(payments.events).toEqual([
        { type: 'PaymentFailed', orderId: 'order-1', error: 'gateway timeout' },
      ]);
    });

    it('lets a database error propagate, so the retry resumes the payment', async () => {
      payments.failNextSave = new Error('db down');

      await expect(useCase.execute(orderCreated)).rejects.toThrow('db down');
      expect(status()).toBe(PaymentStatus.PROCESSING);
      expect(payments.events).toHaveLength(0);

      await useCase.execute(orderCreated);

      expect(status()).toBe(PaymentStatus.APPROVED);
      expect(eventTypes()).toEqual(['PaymentApproved']);
    });

    it.each([
      PaymentStatus.APPROVED,
      PaymentStatus.DECLINED,
      PaymentStatus.FAILED,
      PaymentStatus.REFUNDED,
    ])(
      'does nothing on redelivery for a %s payment (its event is already in the outbox)',
      async (decided) => {
        payments.seed('order-1', decided);

        await useCase.execute(orderCreated);

        expect(gateway.charge).not.toHaveBeenCalled();
        expect(payments.events).toHaveLength(0);
        expect(status()).toBe(decided);
      },
    );

    it('resumes a payment stuck in PROCESSING', async () => {
      payments.seed('order-1', PaymentStatus.PROCESSING);

      await useCase.execute(orderCreated);

      expect(gateway.charge).toHaveBeenCalledTimes(1);
      expect(payments.size).toBe(1);
      expect(status()).toBe(PaymentStatus.APPROVED);
    });

    it('never charges a tombstone (cancelled before OrderCreated)', async () => {
      payments.seed('order-1', PaymentStatus.CANCELLED, { amountCents: null });

      await useCase.execute(orderCreated);

      expect(gateway.charge).not.toHaveBeenCalled();
      expect(gateway.refund).not.toHaveBeenCalled();
      expect(status()).toBe(PaymentStatus.CANCELLED);
    });

    it('does not count a refund when the cancelled payment was never charged', async () => {
      payments.seed('order-1', PaymentStatus.CANCELLED);
      gateway.refund.mockResolvedValue(false);

      await useCase.execute(orderCreated);

      expect(gateway.charge).not.toHaveBeenCalled();
      expect(metrics.incrementPaymentsRefunded).not.toHaveBeenCalled();
    });
  });

  describe('cancel while the charge is in flight', () => {
    it('does not approve and refunds the charge', async () => {
      cancelDuringCharge();

      await useCase.execute(orderCreated);

      const payment = payments.stored('order-1')!;
      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(payments.events).toHaveLength(0);
      expect(metrics.incrementPaymentsApproved).not.toHaveBeenCalled();
      expect(gateway.refund).toHaveBeenCalledWith(payment.id);
      expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
    });

    it('retries a failed refund on redelivery', async () => {
      cancelDuringCharge();
      gateway.refund.mockRejectedValueOnce(new Error('provider down'));

      await expect(useCase.execute(orderCreated)).rejects.toThrow(
        'provider down',
      );
      await useCase.execute(orderCreated);

      expect(gateway.charge).toHaveBeenCalledTimes(1);
      expect(gateway.refund).toHaveBeenCalledTimes(2);
      expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
    });
  });

  describe('resume (reconciliation)', () => {
    it('charges a stuck PROCESSING payment and records its result', async () => {
      const stuck = payments.seed('order-1', PaymentStatus.PROCESSING);

      await useCase.resume(stuck);

      expect(gateway.charge).toHaveBeenCalledTimes(1);
      expect(status()).toBe(PaymentStatus.APPROVED);
      expect(eventTypes()).toEqual(['PaymentApproved']);
    });

    it('records nothing if a consumer decided the payment in the meantime', async () => {
      const stuck = payments.seed('order-1', PaymentStatus.PROCESSING);
      payments.setStatus('order-1', PaymentStatus.DECLINED);
      gateway.charge.mockResolvedValue({
        status: 'declined',
        reason: 'No funds',
      });

      await useCase.resume(stuck);

      expect(status()).toBe(PaymentStatus.DECLINED);
      expect(payments.events).toHaveLength(0);
    });
  });
});
