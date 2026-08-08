import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { rabbitmqBaseConfig } from '@messaging/rabbitmq';
import { PrismaModule } from '@order/prisma/prisma.module';

import { OrderModule } from './modules/order/order.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RabbitMQModule.forRootAsync({
      useFactory: () => rabbitmqBaseConfig,
    }),
    OrderModule,
  ],
})
export class AppModule {}