import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '@order/prisma/prisma.module';

import { createEnvValidator } from '@common/config';
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
    PrismaModule,
    RabbitMQModule,
    OrderModule,
    HealthModule,
  ],
})
export class AppModule {}
