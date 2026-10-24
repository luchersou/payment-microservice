import { BaseEvent } from '@common/events';

import { PaymentEventTypes } from './payment-event-types';

/**
 * The customer got the money back: the order was cancelled after being paid,
 * or while its charge was in flight. Informational: nothing reacts to it
 * as part of the saga.
 */
export interface PaymentRefundedPayload {
  orderId: string;
  transactionId: string;
}

export class PaymentRefundedEvent extends BaseEvent<
  PaymentRefundedPayload,
  PaymentEventTypes
> {
  readonly eventType = PaymentEventTypes.PAYMENT_REFUNDED;
}
