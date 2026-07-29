import { EventTypes } from '@contracts/types';

import { BaseEvent } from '@libs/common/events';

export interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  total: number;
}

export class OrderCreatedEvent extends BaseEvent<OrderCreatedPayload> {
  readonly eventType = EventTypes.ORDER_CREATED;
}
