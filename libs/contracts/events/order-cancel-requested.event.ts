import { BaseEvent } from './base.event';
import { EventTypes } from '@contracts/types/event-types.enum';

export interface OrderCancelRequestedPayload {
  orderId: string;
}

export class OrderCancelRequestedEvent
  extends BaseEvent<OrderCancelRequestedPayload> {

  readonly eventType = EventTypes.ORDER_CANCEL_REQUESTED;
}