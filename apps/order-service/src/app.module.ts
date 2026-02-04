import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma/prisma.module';
import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';
import { OrderService } from './modules/order/order.service';
import { OrderRepository } from './modules/order/order.repository';
import { OrderConsumer } from './modules/order/order.consumer';

@Module({
  imports: [PrismaModule, RabbitMQModule],
  providers: [OrderService, OrderRepository, OrderConsumer],
})
export class AppModule {}
