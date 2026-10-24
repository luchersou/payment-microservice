import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from '@order/prisma/prisma.module';
import { PrismaService } from '@order/prisma/prisma.service';

import { createEnvValidator } from '@common/config';
import { OutboxModule } from '@messaging/outbox';
import { RabbitMQModule } from '@messaging/rabbitmq';

import { OrderEnvironment } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { OrderModule } from './modules/order/order.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(OrderEnvironment),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RabbitMQModule,
    OutboxModule.forRoot(PrismaService),
    OrderModule,
    HealthModule,
  ],
})
export class AppModule {}
