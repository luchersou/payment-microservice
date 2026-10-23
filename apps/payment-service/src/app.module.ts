import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '@payment/prisma/prisma.module';

import { createEnvValidator } from '@common/config';
import { RabbitMQModule } from '@messaging/rabbitmq';

import { PaymentEnvironment } from './config/env.validation';
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(PaymentEnvironment),
    }),
    PrismaModule,
    RabbitMQModule,
    PaymentModule,
  ],
})
export class AppModule {}
