export const RoutingKeys = {
  CREATE_ORDER_REQUESTED: 'order.create.requested',
  ORDER_CREATED: 'order.created',
  ORDER_CANCELLED: 'order.cancelled',
  ORDER_CANCEL_REQUESTED: 'order.cancel.requested',

  PAYMENT_APPROVED: 'payment.approved',
  PAYMENT_DECLINED: 'payment.declined',
  PAYMENT_FAILED: 'payment.failed',

  PAYMENT_ALL: 'payment.*'
} as const;
