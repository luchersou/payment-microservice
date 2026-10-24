import { Payment } from '../payment';

export const PAYMENT_REPOSITORY = Symbol('PAYMENT_REPOSITORY');

/** Payments are unique per orderId, which is what makes the saga idempotent */
export interface PaymentRepository {
  findByOrderId(orderId: string): Promise<Payment | null>;

  /** New PROCESSING payment, or null if the order already has a payment */
  createProcessing(
    orderId: string,
    amountCents: number,
  ): Promise<Payment | null>;

  /** CANCELLED tombstone, or null if the order already has a payment */
  createCancelledTombstone(orderId: string): Promise<Payment | null>;

  /**
   * Persists the payment's new status and its pending events atomically,
   * only if the stored status is still `payment.loadedStatus`. Returns false
   * (saving nothing) when it changed concurrently.
   */
  save(payment: Payment): Promise<boolean>;

  /** PROCESSING payments not updated since `updatedBefore`, oldest first */
  findStuckProcessing(updatedBefore: Date, limit: number): Promise<Payment[]>;
}
