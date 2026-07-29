import { BaseEvent } from '@common/events';
import { CancelReason } from './cancel-reason';
import { OrderEventTypes } from './order-event-types';

export interface OrderCancelledPayload {
  orderId: string;
  reason: CancelReason;
  cancelledAt: Date;
}

export class OrderCancelledEvent extends BaseEvent<
  OrderCancelledPayload,
  OrderEventTypes
> {
  readonly eventType = OrderEventTypes.ORDER_CANCELLED;
}