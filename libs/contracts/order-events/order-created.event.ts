import { BaseEvent } from '@common/events';

import { OrderEventTypes } from './order-event-types';

export interface OrderCreatedPayload {
  orderId: string;
  userId: string;
  /** Integer amount in cents (e.g. 1999 = 19.99), never a float */
  totalCents: number;
}

export class OrderCreatedEvent extends BaseEvent<
  OrderCreatedPayload,
  OrderEventTypes
> {
  readonly eventType = OrderEventTypes.ORDER_CREATED;
}
