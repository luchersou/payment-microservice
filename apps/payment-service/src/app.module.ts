import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '@payment/prisma/prisma.module';
import { PrismaService } from '@payment/prisma/prisma.service';

import { createEnvValidator } from '@common/config';
import { OutboxModule } from '@messaging/outbox';
import { RabbitMQModule } from '@messaging/rabbitmq';

import { PaymentEnvironment } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(PaymentEnvironment),
    }),
    PrismaModule,
    RabbitMQModule,
    OutboxModule.forRoot(PrismaService),
    PaymentModule,
    HealthModule,
  ],
})
export class AppModule {}
