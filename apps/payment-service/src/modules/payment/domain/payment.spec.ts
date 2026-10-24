import { InvalidPaymentTransitionError, Payment } from './payment';
import { PaymentStatus } from './payment-status';

const payment = (status: PaymentStatus, amountCents: number | null = 100) =>
  Payment.fromProps({
    id: 'pay-1',
    orderId: 'order-1',
    amountCents,
    status,
    failureReason: null,
  });

describe('Payment', () => {
  it('approves a PROCESSING payment and records PaymentApproved', () => {
    const p = payment(PaymentStatus.PROCESSING);

    p.approve();

    expect(p.status).toBe(PaymentStatus.APPROVED);
    expect(p.loadedStatus).toBe(PaymentStatus.PROCESSING);
    expect(p.pullEvents()).toEqual([
      { type: 'PaymentApproved', paymentId: 'pay-1', orderId: 'order-1' },
    ]);
  });

  it('keeps the reason of a decline and of a failure', () => {
    const declined = payment(PaymentStatus.PROCESSING);
    const failed = payment(PaymentStatus.PROCESSING);

    declined.decline('No funds');
    failed.fail('timeout');

    expect(declined.failureReason).toBe('No funds');
    expect(declined.pullEvents()).toEqual([
      { type: 'PaymentDeclined', orderId: 'order-1', reason: 'No funds' },
    ]);
    expect(failed.failureReason).toBe('timeout');
    expect(failed.pullEvents()).toEqual([
      { type: 'PaymentFailed', orderId: 'order-1', error: 'timeout' },
    ]);
  });

  it('cancels and refunds without announcing anything', () => {
    const processing = payment(PaymentStatus.PROCESSING);
    const approved = payment(PaymentStatus.APPROVED);

    processing.cancel();
    approved.refund();

    expect(processing.status).toBe(PaymentStatus.CANCELLED);
    expect(approved.status).toBe(PaymentStatus.REFUNDED);
    expect(processing.pullEvents()).toEqual([]);
    expect(approved.pullEvents()).toEqual([]);
  });

  it('rejects transitions the state machine does not allow', () => {
    expect(() => payment(PaymentStatus.CANCELLED).approve()).toThrow(
      InvalidPaymentTransitionError,
    );
    expect(() => payment(PaymentStatus.PROCESSING).refund()).toThrow(
      InvalidPaymentTransitionError,
    );
  });

  it('empties the events once pulled', () => {
    const p = payment(PaymentStatus.PROCESSING);
    p.approve();

    p.pullEvents();

    expect(p.pullEvents()).toEqual([]);
  });

  it('knows a tombstone was never charged', () => {
    expect(payment(PaymentStatus.CANCELLED, null).mayHaveBeenCharged).toBe(
      false,
    );
    expect(payment(PaymentStatus.CANCELLED).mayHaveBeenCharged).toBe(true);
  });
});
