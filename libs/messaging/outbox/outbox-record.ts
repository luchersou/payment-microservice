import { CorrelationIdService } from '@common/context';
import { BaseEvent } from '@common/events';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Columns of an outbox_messages row written by a service */
export interface OutboxRecord {
  exchange: string;
  routingKey: string;
  /** Plain JSON: dates are serialized, as they would be on the wire */
  payload: { [key: string]: JsonValue };
  correlationId: string | null;
}

/**
 * Row to insert in the same transaction as the state change the event
 * announces: `tx.outboxMessage.create({ data: toOutboxRecord(...) })`.
 */
export function toOutboxRecord(
  exchange: string,
  routingKey: string,
  event: BaseEvent<unknown>,
): OutboxRecord {
  return {
    exchange,
    routingKey,
    payload: JSON.parse(JSON.stringify(event)) as OutboxRecord['payload'],
    correlationId: CorrelationIdService.getId() ?? event.correlationId ?? null,
  };
}
