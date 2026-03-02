import { BaseEvent } from '@contracts/events/base.event';
import { EventTypes } from '@contracts/types/event-types.enum';

export interface CreateOrderRequestedPayload {
  userId: string;
  total: number;
}

export class CreateOrderRequestedEvent extends BaseEvent<CreateOrderRequestedPayload> {

  readonly eventType = EventTypes.CREATE_ORDER_REQUESTED;
}