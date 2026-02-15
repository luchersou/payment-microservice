import { BaseEvent } from './base.event';
import { EventTypes } from '@contracts/types/event-types.enum';
export interface PaymentApprovedPayload {
    orderId: string;
    transactionId: string;
}
export declare class PaymentApprovedEvent extends BaseEvent<PaymentApprovedPayload> {
    readonly eventType = EventTypes.PAYMENT_APPROVED;
}
