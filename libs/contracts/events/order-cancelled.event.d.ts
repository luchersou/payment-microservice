import { BaseEvent } from './base.event';
import { EventTypes } from '@contracts/types/event-types.enum';
import { CancelReason } from '@contracts/types/cancel-reason.enum';
export interface OrderCancelledPayload {
    orderId: string;
    reason: CancelReason;
    cancelledAt: Date;
}
export declare class OrderCancelledEvent extends BaseEvent<OrderCancelledPayload> {
    readonly eventType = EventTypes.ORDER_CANCELLED;
}
