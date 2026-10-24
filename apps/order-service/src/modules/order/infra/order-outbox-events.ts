import { CorrelationIdService } from '@common/context';
import { OutboxRecord, toOutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import {
  CancelReason,
  OrderCancelledEvent,
  OrderCreatedEvent,
} from '@contracts/order-events';

import { OrderEvent } from '../domain/order';

/** Domain event → outbox row carrying the public contract event */
export function toOrderOutboxRecord(event: OrderEvent): OutboxRecord {
  const correlationId = CorrelationIdService.getId();

  switch (event.type) {
    case 'OrderCreated':
      return toOutboxRecord(
        Exchanges.ORDERS,
        RoutingKeys.ORDER_CREATED,
        new OrderCreatedEvent(
          { orderId: event.orderId, userId: event.userId, total: event.total },
          correlationId,
        ),
      );
    case 'OrderCancelled':
      return toOutboxRecord(
        Exchanges.ORDERS,
        RoutingKeys.ORDER_CANCELLED,
        new OrderCancelledEvent(
          {
            orderId: event.orderId,
            // Orders are only ever cancelled by their user
            reason: CancelReason.USER_REQUESTED,
            cancelledAt: event.cancelledAt,
          },
          correlationId,
        ),
      );
  }
}
