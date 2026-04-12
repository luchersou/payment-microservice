import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { PrismaModule } from '@order/prisma/prisma.module';
import { orderRabbitmqConfig } from './rabbitmq.config';

import { OrdersController } from './modules/order/order.controller';
import { OrderService } from './modules/order/order.service';
import { OrderConsumer } from './modules/order/order.consumer';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    
    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        ...orderRabbitmqConfig,
      }),
    }),
  ],
  controllers: [OrdersController],
  providers: [OrderService, OrderConsumer],
})
export class AppModule {}