import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { CancelPaymentUseCase } from './application/cancel-payment.use-case';
import { PaymentQueriesService } from './application/payment-queries.service';
import { PaymentReconciliationService } from './application/payment-reconciliation.service';
import { ProcessPaymentUseCase } from './application/process-payment.use-case';
import { PaymentConsumer } from './consumers/payment.consumer';
import { PaymentDlqConsumer } from './consumers/payment-dlq.consumer';
import { PaymentsController } from './controllers/payment.controller';
import { PAYMENT_REPOSITORY } from './domain/ports/payment.repository';
import { PAYMENT_GATEWAY } from './domain/ports/payment-gateway';
import { PrismaFailedMessageRepository } from './infra/prisma-failed-message.repository';
import { PrismaPaymentRepository } from './infra/prisma-payment.repository';
import { SimulatedPaymentGateway } from './infra/simulated-payment.gateway';

@Module({
  imports: [MetricsModule],
  controllers: [PaymentsController],
  providers: [
    // Ports → adapters
    { provide: PAYMENT_REPOSITORY, useClass: PrismaPaymentRepository },
    {
      provide: PAYMENT_GATEWAY,
      useFactory: () => new SimulatedPaymentGateway(),
    },
    PrismaFailedMessageRepository,

    ProcessPaymentUseCase,
    CancelPaymentUseCase,
    PaymentQueriesService,
    PaymentReconciliationService,

    PaymentConsumer,
    PaymentDlqConsumer,
  ],
})
export class PaymentModule {}
