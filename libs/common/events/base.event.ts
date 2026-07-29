export abstract class BaseEvent<TPayload, TEventType extends string = string> {
  abstract readonly eventType: TEventType;

  readonly eventId: string;
  readonly occurredAt: Date;
  readonly payload: TPayload;
  readonly correlationId?: string;

  constructor(payload: TPayload, correlationId?: string) {
    this.eventId = crypto.randomUUID();
    this.occurredAt = new Date();
    this.payload = payload;
    this.correlationId = correlationId;
  }
}