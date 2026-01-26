import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrderPublisher } from '../rabbitmq/order.publisher';

@Module({
  controllers: [OrdersController],
  providers: [OrdersService, PrismaService, OrderPublisher],
})
export class OrdersModule {}
