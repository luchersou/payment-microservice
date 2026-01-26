import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderPublisher } from '../rabbitmq/order.publisher';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private publisher: OrderPublisher,
  ) {}

  async createOrder(total: number) {
    const order = await this.prisma.order.create({
      data: {
        total,
        status: 'PENDING',
      },
    });

    await this.publishOrderCreatedEvent(order.id, order.total);

    return order;
  }

  async findById(id: string) {
    return this.prisma.order.findUnique({
      where: { id },
    });
  }

  async findAll() {
    return this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(id: string) {
    return this.prisma.order.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async publishOrderCreatedEvent(orderId: string, total: number) {
    await this.publisher.publishOrderCreated({
      orderId,
      total,
    });
  }
}
