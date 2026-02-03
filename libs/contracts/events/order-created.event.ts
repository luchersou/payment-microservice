import { BaseEvent } from './base.event';

export interface OrderCreatedPayload {
  orderId: string;
  customerId: string;
  amount: number;
}

export class OrderCreatedEvent extends BaseEvent<OrderCreatedPayload> {}
