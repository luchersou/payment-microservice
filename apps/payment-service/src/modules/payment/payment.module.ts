import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { PaymentConsumer } from './consumers/payment.consumer';
import { PaymentDlqConsumer } from './consumers/payment-dlq.consumer';
import { PaymentsController } from './controllers/payment.controller';
import { PAYMENT_GATEWAY } from './domain/ports/payment-gateway';
import { SimulatedPaymentGateway } from './infra/simulated-payment.gateway';
import { PaymentService } from './services/payment.service';
import { PaymentReconciliationService } from './services/payment-reconciliation.service';

@Module({
  imports: [MetricsModule],
  controllers: [PaymentsController],
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      useFactory: () => new SimulatedPaymentGateway(),
    },
    PaymentService,
    PaymentReconciliationService,
    PaymentConsumer,
    PaymentDlqConsumer,
  ],
})
export class PaymentModule {}
