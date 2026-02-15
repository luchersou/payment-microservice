import { BaseEvent } from './base.event';
import { EventTypes } from '@contracts/types/event-types.enum';

export interface OrderCancelledPayload {
  orderId: string;
  reason: string;
  cancelledAt: Date;
}

export class OrderCancelledEvent extends BaseEvent<OrderCancelledPayload> {
  readonly eventType = EventTypes.ORDER_CANCELLED;
}
