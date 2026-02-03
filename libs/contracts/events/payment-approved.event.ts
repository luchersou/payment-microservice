import { BaseEvent } from './base.event';

export interface PaymentApprovedPayload {
  orderId: string;
  transactionId: string;
}

export class PaymentApprovedEvent extends BaseEvent<PaymentApprovedPayload> {}
