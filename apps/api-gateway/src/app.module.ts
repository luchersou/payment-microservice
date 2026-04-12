import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RabbitMQModule } from '@messaging/rabbitmq';

import { CustomHttpModule } from './common/http';
import { OrdersModule } from './modules/orders';
import { PaymentsModule } from './modules/payments';

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
