import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { OrderStatus } from '@database/prisma/generated/prisma/client';

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
    items: { product: string; price: number; quantity: number }[];
  }) {
    const total = data.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0,
    );

    return this.prisma.order.create({
      data: {
        total,
        status: 'PENDING',
        items: {
          create: data.items,
        },
      },
      include: { items: true },
    });
  }


  async updateStatus(orderId: string, status: OrderStatus) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
  }

  async findById(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
  }
}
