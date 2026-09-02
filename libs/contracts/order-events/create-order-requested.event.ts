import { BaseEvent } from '@common/events';

import { OrderEventTypes } from './order-event-types';

export interface CreateOrderRequestedPayload {
  userId: string;
  total: number;
}

export class CreateOrderRequestedEvent extends BaseEvent<
  CreateOrderRequestedPayload,
  OrderEventTypes
> {
  readonly eventType = OrderEventTypes.ORDER_CREATE_REQUESTED;
}
