import { CorrelationIdService } from '@common/context';
import { OutboxRecord, toOutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import {
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
} from '@contracts/payment-events';

import { PaymentEvent } from '../domain/payment';

/** Domain event → outbox row carrying the public contract event */
export function toPaymentOutboxRecord(event: PaymentEvent): OutboxRecord {
  const correlationId = CorrelationIdService.getId();

  switch (event.type) {
    case 'PaymentApproved':
      return toOutboxRecord(
        Exchanges.PAYMENTS,
        RoutingKeys.PAYMENT_APPROVED,
        new PaymentApprovedEvent(
          { orderId: event.orderId, transactionId: event.paymentId },
          correlationId,
        ),
      );
    case 'PaymentDeclined':
      return toOutboxRecord(
        Exchanges.PAYMENTS,
        RoutingKeys.PAYMENT_DECLINED,
        new PaymentDeclinedEvent(
          { orderId: event.orderId, reason: event.reason },
          correlationId,
        ),
      );
    case 'PaymentFailed':
      return toOutboxRecord(
        Exchanges.PAYMENTS,
        RoutingKeys.PAYMENT_FAILED,
        new PaymentFailedEvent(
          { orderId: event.orderId, error: event.error },
          correlationId,
        ),
      );
    case 'PaymentRefunded':
      return toOutboxRecord(
        Exchanges.PAYMENTS,
        RoutingKeys.PAYMENT_REFUNDED,
        new PaymentRefundedEvent(
          { orderId: event.orderId, transactionId: event.paymentId },
          correlationId,
        ),
      );
  }
}
