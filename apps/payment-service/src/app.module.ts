import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { PrismaModule } from '@payment/prisma/prisma.module';

import { PaymentModule } from './modules/payment/payment.module';
import { paymentRabbitmqConfig } from './rabbitmq.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        ...paymentRabbitmqConfig,
      }),
    }),
    PaymentModule,
  ],
})
export class AppModule {}