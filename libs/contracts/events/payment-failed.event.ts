import { EventTypes } from '@contracts/types';

import { BaseEvent } from './base.event';

export interface PaymentFailedPayload {
  orderId: string;
  error: string;
}

export class PaymentFailedEvent extends BaseEvent<PaymentFailedPayload> {
  readonly eventType = EventTypes.PAYMENT_FAILED;
}
