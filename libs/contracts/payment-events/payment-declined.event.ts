import { BaseEvent } from '@common/events';

import { PaymentEventTypes } from './payment-event-types';

export interface PaymentDeclinedPayload {
  orderId: string;
  reason: string;
}

export class PaymentDeclinedEvent extends BaseEvent<
  PaymentDeclinedPayload,
  PaymentEventTypes
> {
  readonly eventType = PaymentEventTypes.PAYMENT_DECLINED;
}
