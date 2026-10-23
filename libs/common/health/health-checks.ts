import { HealthIndicatorService } from '@nestjs/terminus';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

export function checkRabbitMQ(
  health: HealthIndicatorService,
  amqp: AmqpConnection,
  key = 'rabbitmq',
) {
  const indicator = health.check(key);

  return amqp.connected
    ? indicator.up()
    : indicator.down({ message: 'Not connected to RabbitMQ' });
}

export async function checkDatabase(
  health: HealthIndicatorService,
  ping: () => Promise<unknown>,
  key = 'database',
) {
  const indicator = health.check(key);

  try {
    await ping();
    return indicator.up();
  } catch (error) {
    return indicator.down({
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
