import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Options } from 'amqplib';

import { CorrelationIdService } from '@common/context';

/** Anything shaped like a BaseEvent, including one read back from the outbox */
export interface PublishableEvent {
  readonly correlationId?: string;
}

export interface PublishEventOptions {
  /**
   * Reject if the broker has not confirmed the message within this time.
   * Without it, a publish made while disconnected waits for the reconnect.
   */
  timeoutMs?: number;
}

/**
 * The only way services should publish events.
 *
 * - `persistent: true`: queues are durable, but a transient message is still
 *   lost when the broker restarts. Neither the library nor amqplib defaults
 *   to persistent, so it is forced here.
 * - `correlationId`: taken from the async context (falling back to the one
 *   in the event body) so tracing survives every hop.
 */
export function publishEvent(
  amqp: AmqpConnection,
  exchange: string,
  routingKey: string,
  event: PublishableEvent,
  { timeoutMs }: PublishEventOptions = {},
): Promise<boolean> {
  const correlationId = CorrelationIdService.getId() ?? event.correlationId;

  // `timeout` is an amqp-connection-manager option, not part of amqplib's type
  const options: Options.Publish & { timeout?: number } = {
    persistent: true,
    correlationId,
    ...(timeoutMs !== undefined && { timeout: timeoutMs }),
  };

  return amqp.publish(exchange, routingKey, event, options);
}
