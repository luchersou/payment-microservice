import { OrderStatus } from '@order/prisma/generated/prisma/enums';

/**
 * Allowed order status transitions.
 *
 * PENDING_PAYMENT ──► PAID ──► CANCELLED (user cancel, payment gets refunded)
 *        │
 *        ├──► CANCELLED (user cancel)
 *        └──► FAILED    (payment declined or failed)
 *
 * An order may also be created directly as CANCELLED (tombstone) when the
 * cancel request is handled before the create request.
 *
 * CANCELLED and FAILED are terminal.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING_PAYMENT]: [
    OrderStatus.PAID,
    OrderStatus.CANCELLED,
    OrderStatus.FAILED,
  ],
  [OrderStatus.PAID]: [OrderStatus.CANCELLED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.FAILED]: [],
};

/** Statuses from which an order may move to `target` */
export function sourceStatusesFor(target: OrderStatus): OrderStatus[] {
  return (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter((from) =>
    ORDER_TRANSITIONS[from].includes(target),
  );
}
