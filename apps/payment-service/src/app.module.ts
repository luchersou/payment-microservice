import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@payment/prisma/prisma.module';

import { RabbitMQModule } from '@messaging/rabbitmq/rabbitmq.module';

import { PaymentConsumer } from './modules/payment/payment.consumer';
import { PaymentsController } from './modules/payment/payment.controller';
import { PaymentService } from './modules/payment/payment.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMQModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentService, PaymentConsumer],
})
export class AppModule {}
