import { Module } from '@nestjs/common';

import { MetricsModule } from '../metrics/metrics.module';
import { PaymentConsumer } from './consumers/payment.consumer';
import { PaymentDlqConsumer } from './consumers/payment-dlq.consumer';
import { PaymentsController } from './controllers/payment.controller';
import { PaymentService } from './services/payment.service';
import { PaymentReconciliationService } from './services/payment-reconciliation.service';

@Module({
  imports: [MetricsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentService,
    PaymentReconciliationService,
    PaymentConsumer,
    PaymentDlqConsumer,
  ],
})
export class PaymentModule {}
