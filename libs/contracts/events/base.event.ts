export abstract class BaseEvent<T> {
  eventId: string;
  occurredAt: Date;
  payload: T;

  constructor(payload: T) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
    this.payload = payload;
  }
}
