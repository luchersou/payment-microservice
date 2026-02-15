import { BaseEvent } from './base.event';
import { EventTypes } from '@contracts/types/event-types.enum';
export interface PaymentFailedPayload {
    orderId: string;
    error: string;
}
export declare class PaymentFailedEvent extends BaseEvent<PaymentFailedPayload> {
    readonly eventType = EventTypes.PAYMENT_FAILED;
}
