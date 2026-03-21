import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@order/prisma/prisma.module';

import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';

import { OrderConsumer } from './modules/order/order.consumer';
import { OrdersController } from './modules/order/order.controller';
import { OrderService } from './modules/order/order.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMQModule,
  ],
  controllers: [OrdersController],
  providers: [OrderService, OrderConsumer],
})
export class AppModule {}
