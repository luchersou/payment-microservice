import { BaseEvent } from './base.event';

export interface PaymentFailedPayload {
  orderId: string;
  error: string;
}

export class PaymentFailedEvent extends BaseEvent<PaymentFailedPayload> {}
