import { BaseEvent } from './base.event';

export interface OrderCancelledPayload {
  orderId: string;
  reason: string;
  cancelledAt: Date;
}

export class OrderCancelledEvent extends BaseEvent<OrderCancelledPayload> {}
