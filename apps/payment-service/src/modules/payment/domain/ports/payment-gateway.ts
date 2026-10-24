export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type ChargeResult =
  | { status: 'approved' }
  | { status: 'declined'; reason: string };

/**
 * What release() had to undo: an authorization nobody captured (the customer
 * was never charged), a captured charge (money given back), or nothing.
 */
export type ReleaseResult = 'voided' | 'refunded' | 'nothing';

/**
 * External payment provider, used in two steps like real card processors:
 * authorize() only reserves the amount and capture() takes it. The service
 * captures only after recording the approval, so a cancel that wins the race
 * against an in-flight authorization costs the customer nothing.
 *
 * A thrown error means a technical failure (the payment is marked FAILED); a
 * business refusal is a `declined` result.
 *
 * `paymentId` is the idempotency key of every operation: a resumed or
 * redelivered payment may call them again, and the provider must not
 * authorize, capture or give back twice.
 */
export interface PaymentGateway {
  authorize(paymentId: string, amountCents: number): Promise<ChargeResult>;

  /** Takes the authorized amount; a no-op if already captured */
  capture(paymentId: string): Promise<void>;

  /**
   * Undoes whatever happened for the payment: voids an uncaptured
   * authorization or refunds a capture. Safe to call when nothing happened.
   */
  release(paymentId: string): Promise<ReleaseResult>;
}
