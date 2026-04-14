import { Module } from '@nestjs/common';
import { OrderConsumer } from './consumers/order.consumer';
import { OrdersController } from './controllers/order.controller';
import { OrderService } from './services/order.service';

@Module({
  controllers: [OrdersController],
  providers: [OrderService, OrderConsumer],
})
export class OrderModule {}