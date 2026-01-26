import { Module } from '@nestjs/common';
import { OrderConsumer } from './consumers/order.consumer';
import { OrderProcessingService } from './services/order-processing.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [OrderConsumer],
  providers: [OrderProcessingService, PrismaService],
})
export class OrdersModule {}
