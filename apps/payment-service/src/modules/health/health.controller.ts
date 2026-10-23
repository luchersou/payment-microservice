import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { PrismaService } from '@payment/prisma/prisma.service';

import { checkDatabase, checkRabbitMQ } from '@common/health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicator: HealthIndicatorService,
    private readonly prisma: PrismaService,
    private readonly amqp: AmqpConnection,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () =>
        checkDatabase(this.indicator, () => this.prisma.$queryRaw`SELECT 1`),
      () => checkRabbitMQ(this.indicator, this.amqp),
    ]);
  }
}
