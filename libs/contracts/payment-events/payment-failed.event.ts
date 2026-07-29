import { BaseEvent } from '@common/events';
import { PaymentEventTypes } from './payment-event-types';

export interface PaymentFailedPayload {
  orderId: string;
  error: string;
}

export class PaymentFailedEvent extends BaseEvent<
  PaymentFailedPayload,
  PaymentEventTypes
> {
  readonly eventType = PaymentEventTypes.PAYMENT_FAILED;
}