import { Injectable } from '@nestjs/common';
import { PrismaService } from 'apps/worker/src/prisma/prisma.service';

@Injectable()
export class OrderProcessingService {
  constructor(private prisma: PrismaService) {}

  async process(order: any) {
    console.log('⚙️ Processing order...');

    await this.prisma.order.update({
      where: { id: order.orderId },
      data: { status: 'PROCESSING' },
    });

    await new Promise(r => setTimeout(r, 2000)); // simulate payment

    await this.prisma.order.update({
      where: { id: order.orderId },
      data: { status: 'PAID' },
    });

    console.log('✅ Payment completed!');
  }
}
