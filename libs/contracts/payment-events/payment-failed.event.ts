import { EventTypes } from '@contracts/types';

import { BaseEvent } from '@libs/common/events';

export interface PaymentFailedPayload {
  orderId: string;
  error: string;
}

export class PaymentFailedEvent extends BaseEvent<PaymentFailedPayload> {
  readonly eventType = EventTypes.PAYMENT_FAILED;
}
