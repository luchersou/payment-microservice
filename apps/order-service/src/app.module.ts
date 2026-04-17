import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { PrismaModule } from '@order/prisma/prisma.module';

import { OrderModule } from './modules/order/order.module';
import { orderRabbitmqConfig } from './rabbitmq.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        ...orderRabbitmqConfig,
      }),
    }),
    OrderModule,
  ],
})
export class AppModule {}
