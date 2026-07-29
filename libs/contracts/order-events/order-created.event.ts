import { BaseEvent } from '@common/events';
import { OrderEventTypes } from './order-event-types';

export interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  total: number;
}

export class OrderCreatedEvent extends BaseEvent<
  OrderCreatedPayload,
  OrderEventTypes
> {
  readonly eventType = OrderEventTypes.ORDER_CREATED;
}