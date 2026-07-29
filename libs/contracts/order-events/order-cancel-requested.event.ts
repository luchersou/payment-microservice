import { BaseEvent } from '@common/events';
import { OrderEventTypes } from './order-event-types';

export interface OrderCancelRequestedPayload {
  orderId: string;
}

export class OrderCancelRequestedEvent extends BaseEvent<
  OrderCancelRequestedPayload,
  OrderEventTypes
> {
  readonly eventType = OrderEventTypes.ORDER_CANCEL_REQUESTED;
}