import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { PrismaModule } from '@payment/prisma/prisma.module';

import { PaymentConsumer } from './modules/payment/payment.consumer';
import { PaymentsController } from './modules/payment/payment.controller';
import { PaymentService } from './modules/payment/payment.service';
import { paymentRabbitmqConfig } from './rabbitmq.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,

    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        ...paymentRabbitmqConfig,
      }),
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentService, PaymentConsumer],
})
export class AppModule {}
