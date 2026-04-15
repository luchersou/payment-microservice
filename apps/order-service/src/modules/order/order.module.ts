import { Module } from '@nestjs/common';

import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';

import { MetricsModule } from '../metrics/metrics.module';
import { OrderConsumer } from './consumers/order.consumer';
import { OrderDlqConsumer } from './consumers/order-dlq.consumer';
import { OrdersController } from './controllers/order.controller';
import { OrderService } from './services/order.service';

@Module({
  imports: [RabbitMQModule, MetricsModule],
  controllers: [OrdersController],
  providers: [OrderService, OrderConsumer, OrderDlqConsumer],
})
export class OrderModule {}
