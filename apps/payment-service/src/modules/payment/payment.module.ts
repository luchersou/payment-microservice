import { Module } from '@nestjs/common';

import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';

import { PaymentConsumer } from './consumers/payment.consumer';
import { PaymentsController } from './controllers/payment.controller';
import { PaymentService } from './services/payment.service';

@Module({
  imports: [RabbitMQModule],
  controllers: [PaymentsController],
  providers: [PaymentService, PaymentConsumer],
})
export class PaymentModule {}
