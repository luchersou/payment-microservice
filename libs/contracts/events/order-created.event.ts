import { BaseEvent } from './base.event';
import { EventTypes } from '@contracts/types/event-types.enum';

export interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  total: number;
}

export class OrderCreatedEvent extends BaseEvent<OrderCreatedPayload> {
  readonly eventType = EventTypes.ORDER_CREATED;
}
