import { BaseEvent } from '@common/events';

import { PaymentEventTypes } from './payment-event-types';

export interface PaymentApprovedPayload {
  orderId: string;
  transactionId: string;
}

export class PaymentApprovedEvent extends BaseEvent<
  PaymentApprovedPayload,
  PaymentEventTypes
> {
  readonly eventType = PaymentEventTypes.PAYMENT_APPROVED;
}
