import { PaymentStatus } from './payment-status';

/**
 * Allowed payment status transitions.
 *
 * PROCESSING ──► APPROVED ──► REFUNDED (order cancelled after payment)
 *     │
 *     ├──► DECLINED  (gateway declined)
 *     ├──► FAILED    (unexpected gateway error)
 *     └──► CANCELLED (order cancelled while processing)
 *
 * A payment may also be created directly as CANCELLED (tombstone) when the
 * order is cancelled before OrderCreated is handled.
 *
 * DECLINED, REFUNDED, FAILED and CANCELLED are terminal.
 */
export const PAYMENT_TRANSITIONS: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  [PaymentStatus.PROCESSING]: [
    PaymentStatus.APPROVED,
    PaymentStatus.DECLINED,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
  ],
  [PaymentStatus.APPROVED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.DECLINED]: [],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.CANCELLED]: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}
