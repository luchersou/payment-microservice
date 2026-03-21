import { EventTypes } from '@contracts/types/event-types.enum';

import { BaseEvent } from './base.event';

export interface PaymentApprovedPayload {
  orderId: string;
  transactionId: string;
}

export class PaymentApprovedEvent extends BaseEvent<PaymentApprovedPayload> {
  readonly eventType = EventTypes.PAYMENT_APPROVED;
}
