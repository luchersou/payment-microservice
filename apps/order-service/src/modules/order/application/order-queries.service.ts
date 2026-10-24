import { Injectable, NotFoundException } from '@nestjs/common';

import type { Order } from '@order/prisma/generated/prisma/client';
import { PrismaService } from '@order/prisma/prisma.service';

import { OrderResponseDto } from '../dto/order-response.dto';
import { PaginatedOrdersResponseDto } from '../dto/paginated-orders-response.dto';

/** Read side: straight from Prisma to DTOs, no domain objects involved */
@Injectable()
export class OrderQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    page: number,
    limit: number,
  ): Promise<PaginatedOrdersResponseDto> {
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count(),
    ]);

    return {
      data: orders.map(toResponseDto),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return toResponseDto(order);
  }
}

function toResponseDto(order: Order): OrderResponseDto {
  return {
    id: order.id,
    userId: order.userId,
    total: order.total,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}
