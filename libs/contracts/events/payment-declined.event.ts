import { BaseEvent } from './base.event';
import { EventTypes } from '@contracts/types/event-types.enum';

export interface PaymentDeclinedPayload {
  orderId: string;
  reason: string;
}

export class PaymentDeclinedEvent extends BaseEvent<PaymentDeclinedPayload> {
  readonly eventType = EventTypes.PAYMENT_DECLINED;
}
