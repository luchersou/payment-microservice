/**
 * Values of the `event_type` label on the *_message_processing_duration_seconds
 * histograms. One observation per message (consumer level), plus the payment
 * business steps, which have their own labels.
 */
export enum MetricNames {
  // =====================================================
  // MESSAGING (RabbitMQ consumers - message processing time)
  // =====================================================
  PAYMENT_ORDER_CREATED_PROCESSING_DURATION = 'messaging.payment.order_created.processing.duration',
  PAYMENT_ORDER_CANCELLED_PROCESSING_DURATION = 'messaging.payment.order_cancelled.processing.duration',
  ORDER_PAYMENT_RESULT_PROCESSING_DURATION = 'messaging.order.payment_result.processing.duration',
  ORDER_CREATE_REQUESTED_PROCESSING_DURATION = 'messaging.order.create_requested.processing.duration',
  ORDER_CANCEL_REQUESTED_PROCESSING_DURATION = 'messaging.order.cancel_requested.processing.duration',

  // =====================================================
  // BUSINESS (payment decision steps - execution time)
  // =====================================================
  PAYMENT_APPROVAL_DURATION = 'business.payment.approval.duration',
  PAYMENT_DECLINE_DURATION = 'business.payment.decline.duration',
  PAYMENT_FAILURE_DURATION = 'business.payment.failure.duration',

  // =====================================================
  // DLQ (dead-lettered messages: processing cost)
  // =====================================================
  PAYMENT_ORDER_CREATED_DLQ_PROCESSING_DURATION = 'dlq.payment.order_created.processing.duration',
  PAYMENT_ORDER_CANCELLED_DLQ_PROCESSING_DURATION = 'dlq.payment.order_cancelled.processing.duration',
  ORDER_CREATE_DLQ_PROCESSING_DURATION = 'dlq.order.create.processing.duration',
  ORDER_CANCEL_REQUESTED_DLQ_PROCESSING_DURATION = 'dlq.order.cancel_requested.processing.duration',
  ORDER_PAYMENT_RESULT_DLQ_PROCESSING_DURATION = 'dlq.order.payment_result.processing.duration',
}
