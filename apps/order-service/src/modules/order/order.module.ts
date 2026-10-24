import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { ApplyPaymentResultUseCase } from './application/apply-payment-result.use-case';
import { CancelOrderUseCase } from './application/cancel-order.use-case';
import { CreateOrderUseCase } from './application/create-order.use-case';
import { OrderQueriesService } from './application/order-queries.service';
import { OrderReconciliationService } from './application/order-reconciliation.service';
import { OrderConsumer } from './consumers/order.consumer';
import { OrderDlqConsumer } from './consumers/order-dlq.consumer';
import { OrdersController } from './controllers/order.controller';
import { ORDER_REPOSITORY } from './domain/ports/order.repository';
import { PrismaFailedMessageRepository } from './infra/prisma-failed-message.repository';
import { PrismaOrderRepository } from './infra/prisma-order.repository';

@Module({
  imports: [MetricsModule],
  controllers: [OrdersController],
  providers: [
    // Ports → adapters
    { provide: ORDER_REPOSITORY, useClass: PrismaOrderRepository },
    PrismaFailedMessageRepository,

    CreateOrderUseCase,
    CancelOrderUseCase,
    ApplyPaymentResultUseCase,
    OrderQueriesService,
    OrderReconciliationService,

    OrderConsumer,
    OrderDlqConsumer,
  ],
})
export class OrderModule {}
