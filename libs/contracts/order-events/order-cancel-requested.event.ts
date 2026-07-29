import { EventTypes } from '@contracts/types';

import { BaseEvent } from '@libs/common/events';

export interface OrderCancelRequestedPayload {
  orderId: string;
}

export class OrderCancelRequestedEvent extends BaseEvent<OrderCancelRequestedPayload> {
  readonly eventType = EventTypes.ORDER_CANCEL_REQUESTED;
}
