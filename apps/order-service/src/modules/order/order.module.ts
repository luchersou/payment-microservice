import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { OrderConsumer } from './consumers/order.consumer';
import { OrderDlqConsumer } from './consumers/order-dlq.consumer';
import { OrdersController } from './controllers/order.controller';
import { OrderService } from './services/order.service';
import { OrderReconciliationService } from './services/order-reconciliation.service';

@Module({
  imports: [MetricsModule],
  controllers: [OrdersController],
  providers: [
    OrderService,
    OrderReconciliationService,
    OrderConsumer,
    OrderDlqConsumer,
  ],
})
export class OrderModule {}
