import { Queues } from './queues.constant';

export const DLQ = {
  ORDER_CREATE: 'order.create.dlq',
  ORDER_CANCEL_REQUESTED: 'order.cancel-requested.dlq',
  ORDER_PAYMENT_RESULT: 'order.payment-result.dlq',
  PAYMENT_ORDER_CREATED: 'payment.order-created.dlq',
  PAYMENT_ORDER_CANCELLED: 'payment.order-cancelled.dlq',
} as const;

export type DlqName = (typeof DLQ)[keyof typeof DLQ];

/** The queue whose consumer gave up on the messages each DLQ holds */
export const DLQ_SOURCE_QUEUE: Record<DlqName, string> = {
  [DLQ.ORDER_CREATE]: Queues.ORDER_CREATE,
  [DLQ.ORDER_CANCEL_REQUESTED]: Queues.ORDER_CANCEL_REQUESTED,
  [DLQ.ORDER_PAYMENT_RESULT]: Queues.ORDER_PAYMENT_RESULT,
  [DLQ.PAYMENT_ORDER_CREATED]: Queues.PAYMENT_ORDER_CREATED,
  [DLQ.PAYMENT_ORDER_CANCELLED]: Queues.PAYMENT_ORDER_CANCELLED,
};
