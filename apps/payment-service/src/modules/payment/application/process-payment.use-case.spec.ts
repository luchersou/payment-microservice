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

  /** The order gets cancelled while the gateway is authorizing */
  const cancelDuringAuthorization = () =>
    gateway.authorize.mockImplementation(() => {
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
    it('authorizes with the paymentId as idempotency key, approves, then captures', async () => {
      await useCase.execute(orderCreated);

      const payment = payments.stored('order-1')!;
      expect(gateway.authorize).toHaveBeenCalledWith(payment.id, 100);
      expect(gateway.capture).toHaveBeenCalledWith(payment.id);
      expect(payment.status).toBe(PaymentStatus.APPROVED);
      expect(payments.events).toEqual([
        { type: 'PaymentApproved', paymentId: payment.id, orderId: 'order-1' },
      ]);
      expect(metrics.incrementPaymentsApproved).toHaveBeenCalledTimes(1);
    });

    it('captures only after the approval is saved', async () => {
      gateway.capture.mockImplementation(() => {
        expect(status()).toBe(PaymentStatus.APPROVED);
        return Promise.resolve();
      });

      await useCase.execute(orderCreated);

      expect(gateway.capture).toHaveBeenCalledTimes(1);
    });

    it('captures again on redelivery when the capture failed after the approval', async () => {
      gateway.capture.mockRejectedValueOnce(new Error('provider down'));

      await expect(useCase.execute(orderCreated)).rejects.toThrow(
        'provider down',
      );
      expect(status()).toBe(PaymentStatus.APPROVED);

      await useCase.execute(orderCreated);

      expect(gateway.authorize).toHaveBeenCalledTimes(1);
      expect(gateway.capture).toHaveBeenCalledTimes(2);
      expect(eventTypes()).toEqual(['PaymentApproved']);
    });

    it('declines with the gateway reason, capturing nothing', async () => {
      gateway.authorize.mockResolvedValue({
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
      expect(gateway.capture).not.toHaveBeenCalled();
    });

    it('marks FAILED only on gateway errors', async () => {
      gateway.authorize.mockRejectedValue(new Error('gateway timeout'));

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
      'never authorizes again on redelivery for a %s payment (its event is already in the outbox)',
      async (decided) => {
        payments.seed('order-1', decided);

        await useCase.execute(orderCreated);

        expect(gateway.authorize).not.toHaveBeenCalled();
        expect(payments.events).toHaveLength(0);
        expect(status()).toBe(decided);
      },
    );

    it('resumes a payment stuck in PROCESSING', async () => {
      payments.seed('order-1', PaymentStatus.PROCESSING);

      await useCase.execute(orderCreated);

      expect(gateway.authorize).toHaveBeenCalledTimes(1);
      expect(payments.size).toBe(1);
      expect(status()).toBe(PaymentStatus.APPROVED);
    });

    it('never touches the gateway for a tombstone (cancelled before OrderCreated)', async () => {
      payments.seed('order-1', PaymentStatus.CANCELLED, { amountCents: null });

      await useCase.execute(orderCreated);

      expect(gateway.authorize).not.toHaveBeenCalled();
      expect(gateway.release).not.toHaveBeenCalled();
      expect(status()).toBe(PaymentStatus.CANCELLED);
    });

    it('counts nothing when a cancelled payment had nothing to release', async () => {
      payments.seed('order-1', PaymentStatus.CANCELLED);
      gateway.release.mockResolvedValue('nothing');

      await useCase.execute(orderCreated);

      expect(gateway.authorize).not.toHaveBeenCalled();
      expect(metrics.incrementAuthorizationsVoided).not.toHaveBeenCalled();
      expect(metrics.incrementPaymentsRefunded).not.toHaveBeenCalled();
    });
  });

  describe('cancel while the authorization is in flight', () => {
    it('voids the authorization: the customer is never charged', async () => {
      cancelDuringAuthorization();

      await useCase.execute(orderCreated);

      const payment = payments.stored('order-1')!;
      expect(payment.status).toBe(PaymentStatus.CANCELLED);
      expect(gateway.capture).not.toHaveBeenCalled();
      expect(gateway.release).toHaveBeenCalledWith(payment.id);
      expect(metrics.incrementAuthorizationsVoided).toHaveBeenCalledTimes(1);
      expect(metrics.incrementPaymentsApproved).not.toHaveBeenCalled();
      expect(metrics.incrementPaymentsRefunded).not.toHaveBeenCalled();
      // No money moved, so there is nothing to announce
      expect(payments.events).toHaveLength(0);
    });

    it('retries a failed release on redelivery', async () => {
      cancelDuringAuthorization();
      gateway.release.mockRejectedValueOnce(new Error('provider down'));

      await expect(useCase.execute(orderCreated)).rejects.toThrow(
        'provider down',
      );
      await useCase.execute(orderCreated);

      expect(gateway.authorize).toHaveBeenCalledTimes(1);
      expect(gateway.release).toHaveBeenCalledTimes(2);
      expect(gateway.capture).not.toHaveBeenCalled();
      expect(metrics.incrementAuthorizationsVoided).toHaveBeenCalledTimes(1);
    });

    it('announces a refund if the provider reports a capture was given back', async () => {
      cancelDuringAuthorization();
      gateway.release.mockResolvedValue('refunded');

      await useCase.execute(orderCreated);

      expect(metrics.incrementPaymentsRefunded).toHaveBeenCalledTimes(1);
      expect(eventTypes()).toEqual(['PaymentRefunded']);
      expect(status()).toBe(PaymentStatus.CANCELLED);
    });
  });

  describe('resume (reconciliation)', () => {
    it('charges a stuck PROCESSING payment and records its result', async () => {
      const stuck = payments.seed('order-1', PaymentStatus.PROCESSING);

      await useCase.resume(stuck);

      expect(gateway.authorize).toHaveBeenCalledTimes(1);
      expect(gateway.capture).toHaveBeenCalledTimes(1);
      expect(status()).toBe(PaymentStatus.APPROVED);
      expect(eventTypes()).toEqual(['PaymentApproved']);
    });

    it('records nothing if a consumer decided the payment in the meantime', async () => {
      const stuck = payments.seed('order-1', PaymentStatus.PROCESSING);
      payments.setStatus('order-1', PaymentStatus.DECLINED);
      gateway.authorize.mockResolvedValue({
        status: 'declined',
        reason: 'No funds',
      });

      await useCase.resume(stuck);

      expect(status()).toBe(PaymentStatus.DECLINED);
      expect(payments.events).toHaveLength(0);
    });
  });
});
