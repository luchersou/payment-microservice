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
  refund(paymentId: string): Promise<void>;
}
