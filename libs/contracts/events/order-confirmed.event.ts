import { BaseEvent } from './base.event';

export interface OrderConfirmedPayload {
  orderId: string;
  confirmedAt: Date;
}

export class OrderConfirmedEvent extends BaseEvent<OrderConfirmedPayload> {}
