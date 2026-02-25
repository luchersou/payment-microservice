import { EventTypes } from "@contracts/types/event-types.enum";

export abstract class BaseEvent<T> {
  abstract readonly eventType: EventTypes;
  readonly eventId: string;
  readonly occurredAt: Date;
  readonly payload: T;

  constructor(payload: T) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
    this.payload = payload;
  }
}