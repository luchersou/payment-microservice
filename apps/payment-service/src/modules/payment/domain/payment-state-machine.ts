import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';

/**
 * Allowed payment status transitions.
 *
 * PROCESSING ──► APPROVED ──► REFUNDED (order cancelled after payment)
 *     │
 *     ├──► DECLINED (gateway declined, or order cancelled while processing)
 *     └──► FAILED   (unexpected gateway error)
 *
 * DECLINED, REFUNDED and FAILED are terminal.
 */
export const PAYMENT_TRANSITIONS: Record<
  PaymentStatus,
  readonly PaymentStatus[]
> = {
  [PaymentStatus.PROCESSING]: [
    PaymentStatus.APPROVED,
    PaymentStatus.DECLINED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.APPROVED]: [PaymentStatus.REFUNDED],
  [PaymentStatus.DECLINED]: [],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.FAILED]: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}
