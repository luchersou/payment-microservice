import { Module } from '@nestjs/common';

import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';

import { PaymentConsumer } from './consumers/payment.consumer';
import { PaymentDlqConsumer } from './consumers/payment-dlq.consumer';
import { PaymentsController } from './controllers/payment.controller';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [RabbitMQModule],
  controllers: [PaymentsController],
  providers: [PaymentService, PaymentConsumer, PaymentDlqConsumer],
})
export class PaymentModule {}
