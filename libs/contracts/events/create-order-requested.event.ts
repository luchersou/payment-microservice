import { BaseEvent } from '@contracts/events';
import { EventTypes } from '@contracts/types';

export interface CreateOrderRequestedPayload {
  userId: string;
  total: number;
}

export class CreateOrderRequestedEvent extends BaseEvent<CreateOrderRequestedPayload> {
  readonly eventType = EventTypes.CREATE_ORDER_REQUESTED;
}
