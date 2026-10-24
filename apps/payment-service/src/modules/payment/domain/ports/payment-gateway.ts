export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type ChargeResult =
  | { status: 'approved' }
  | { status: 'declined'; reason: string };

/**
 * External payment provider. A thrown error means a technical failure (the
 * payment is marked FAILED); a business refusal is a `declined` result.
 *
 * `paymentId` is the idempotency key of both operations: a resumed or
 * redelivered payment may call them again, and the provider must not charge
 * or refund the customer twice.
 */
export interface PaymentGateway {
  charge(paymentId: string, amount: number): Promise<ChargeResult>;
  /**
   * Gives back a successful charge. Returns false, doing nothing, when there
   * is no charge to give back (never charged, declined, already refunded),
   * so it is safe to call whenever a charge *may* have happened.
   */
  refund(paymentId: string): Promise<boolean>;
}
