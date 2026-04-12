import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';

import { CustomHttpModule } from './common/http/http.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CustomHttpModule,
    RabbitMQModule,
    OrdersModule,
    PaymentsModule,
  ],
})
export class AppModule {}
