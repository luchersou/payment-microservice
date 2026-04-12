export const DLQ = {
  ORDER_CREATE: 'order.create.dlq',
  ORDER_CANCEL_REQUESTED: 'order.cancel-requested.dlq',
  ORDER_PAYMENT_RESULT: 'order.payment-result.dlq',
  PAYMENT_ORDER_CREATED: 'payment.order-created.dlq',
  PAYMENT_ORDER_CANCELLED: 'payment.order-cancelled.dlq',
} as const;