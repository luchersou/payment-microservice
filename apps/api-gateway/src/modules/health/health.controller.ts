import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { checkRabbitMQ } from '@common/health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly amqp: AmqpConnection,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => checkRabbitMQ(this.indicator, this.amqp)]);
  }
}
