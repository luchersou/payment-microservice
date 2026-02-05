import { Module } from '@nestjs/common';
import { PaymentService } from './modules/payment/payment.service';
import { PaymentConsumer } from './modules/payment/payment.consumer';

@Module({
  providers: [PaymentService, PaymentConsumer],
})
export class PaymentModule {}
