import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { rabbitmqBaseConfig } from '@messaging/rabbitmq/config/rabbitmq.base.config';

import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,
    RabbitMQModule.forRootAsync({
      useFactory: () => rabbitmqBaseConfig as any,
    }),
    OrdersModule,
    PaymentsModule,
  ],
  exports: [RabbitMQModule],
})
export class AppModule {}