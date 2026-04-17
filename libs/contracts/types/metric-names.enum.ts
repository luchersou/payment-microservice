export enum MetricNames {
  // =====================================================
  // MESSAGING (RabbitMQ consumers - message processing time)
  // =====================================================
  PAYMENT_ORDER_CREATED_PROCESSING_DURATION = 'messaging.payment.order_created.processing.duration',
  PAYMENT_ORDER_CANCELLED_PROCESSING_DURATION = 'messaging.payment.order_cancelled.processing.duration',
  ORDER_PAYMENT_RESULT_PROCESSING_DURATION = 'messaging.order.payment_result.processing.duration',

  // =====================================================
  // BUSINESS (domain operations - execution time)
  // =====================================================
  PAYMENT_APPROVAL_DURATION = 'business.payment.approval.duration',
  PAYMENT_DECLINE_DURATION = 'business.payment.decline.duration',
  PAYMENT_FAILURE_DURATION = 'business.payment.failure.duration',

  // =====================================================
  // API (HTTP requests - request handling time)
  // =====================================================
  CREATE_ORDER_REQUEST_DURATION = 'api.order.create.request.duration',
  ORDER_CANCEL_REQUEST_DURATION = 'api.order.cancel.request.duration',

  // =====================================================
  // DLQ - PAYMENT (dead-lettered messages: volume and processing cost)
  // =====================================================
  PAYMENT_ORDER_CREATED_DLQ_COUNT = 'dlq.payment.order_created.count',
  PAYMENT_ORDER_CANCELLED_DLQ_COUNT = 'dlq.payment.order_cancelled.count',
  PAYMENT_ORDER_CREATED_DLQ_PROCESSING_DURATION = 'dlq.payment.order_created.processing.duration',
  PAYMENT_ORDER_CANCELLED_DLQ_PROCESSING_DURATION = 'dlq.payment.order_cancelled.processing.duration',

  // =====================================================
  // DLQ - ORDER (dead-lettered messages: volume and processing cost)
  // =====================================================
  ORDER_CREATE_DLQ_COUNT = 'dlq.order.create.count',
  ORDER_CANCEL_REQUESTED_DLQ_COUNT = 'dlq.order.cancel_requested.count',
  ORDER_PAYMENT_RESULT_DLQ_COUNT = 'dlq.order.payment_result.count',
  ORDER_CREATE_DLQ_PROCESSING_DURATION = 'dlq.order.create.processing.duration',
  ORDER_CANCEL_REQUESTED_DLQ_PROCESSING_DURATION = 'dlq.order.cancel_requested.processing.duration',
  ORDER_PAYMENT_RESULT_DLQ_PROCESSING_DURATION = 'dlq.order.payment_result.processing.duration',
}
