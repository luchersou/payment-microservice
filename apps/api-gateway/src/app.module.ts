import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; 
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),  
    HttpModule,
    RabbitMQModule,
    OrdersModule,
    PaymentsModule,
  ],
})
export class AppModule {}