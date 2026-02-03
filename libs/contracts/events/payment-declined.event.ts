import { BaseEvent } from './base.event';

export interface PaymentDeclinedPayload {
  orderId: string;
  reason: string;
}

export class PaymentDeclinedEvent extends BaseEvent<PaymentDeclinedPayload> {}
