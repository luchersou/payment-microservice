import { Module } from '@nestjs/common';
import { PaymentConsumer } from './consumers/payment.consumer';
import { PaymentsController } from './controllers/payment.controller';
import { PaymentService } from './services/payment.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentService, PaymentConsumer],
})
export class PaymentModule {}