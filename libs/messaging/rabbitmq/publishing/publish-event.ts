import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { CorrelationIdService } from '@common/context';
import { BaseEvent } from '@common/events';

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
  event: BaseEvent<unknown>,
): Promise<boolean> {
  const correlationId = CorrelationIdService.getId() ?? event.correlationId;

  return amqp.publish(exchange, routingKey, event, {
    persistent: true,
    correlationId,
  });
}
