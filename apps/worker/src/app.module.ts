import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { OrdersModule } from './modules/orders/orders.module';

@Module({
  imports: [PrismaModule, OrdersModule],
})
export class AppModule {}
