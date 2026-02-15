import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@database/prisma/prisma.module';
import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';
import { OrdersController } from './modules/order/order.controller';
import { OrderService } from './modules/order/order.service';
import { OrderConsumer } from './modules/order/order.consumer';

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