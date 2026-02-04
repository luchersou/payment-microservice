import { BaseEvent } from './base.event';

export interface OrderCreatedPayload {
  orderId: string;
  amount: number;
}

export class OrderCreatedEvent extends BaseEvent<OrderCreatedPayload> {}
