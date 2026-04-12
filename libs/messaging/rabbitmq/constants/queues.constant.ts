export const Queues = {
  ORDER_CREATE: 'order.create.queue',
  ORDER_CANCEL_REQUESTED: 'order.cancel-requested.queue',
  ORDER_PAYMENT_RESULT: 'order.payment-result.queue',

  PAYMENT_ORDER_CREATED: 'payment.order-created.queue',
  PAYMENT_ORDER_CANCELLED: 'payment.order-cancelled.queue',
} as const;
