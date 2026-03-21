import { EventTypes } from '@contracts/types/event-types.enum';

import { BaseEvent } from './base.event';

export interface OrderCancelRequestedPayload {
  orderId: string;
}

export class OrderCancelRequestedEvent extends BaseEvent<OrderCancelRequestedPayload> {
  readonly eventType = EventTypes.ORDER_CANCEL_REQUESTED;
}
