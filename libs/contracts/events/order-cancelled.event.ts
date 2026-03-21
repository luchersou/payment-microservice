import { CancelReason } from '@contracts/types/cancel-reason.enum';
import { EventTypes } from '@contracts/types/event-types.enum';

import { BaseEvent } from './base.event';

export interface OrderCancelledPayload {
  orderId: string;
  reason: CancelReason;
  cancelledAt: Date;
}

export class OrderCancelledEvent extends BaseEvent<OrderCancelledPayload> {
  readonly eventType = EventTypes.ORDER_CANCELLED;
}
