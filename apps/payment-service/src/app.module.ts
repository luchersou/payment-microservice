import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { rabbitmqBaseConfig } from '@messaging/rabbitmq';
import { PrismaModule } from '@payment/prisma/prisma.module';

import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMQModule.forRootAsync({
      useFactory: () => rabbitmqBaseConfig,
    }),
    PaymentModule,
  ],
})
export class AppModule {}