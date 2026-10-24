import { Injectable, NotFoundException } from '@nestjs/common';

import type { Payment } from '@payment/prisma/generated/prisma/client';
import { PrismaService } from '@payment/prisma/prisma.service';

import { PaginatedPaymentsResponseDto } from '../dto/paginated-payments-response.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';
import { PaymentStatsResponseDto } from '../dto/payment-stats-response.dto';

/** Read side: straight from Prisma to DTOs, no domain objects involved */
@Injectable()
export class PaymentQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    page: number,
    limit: number,
  ): Promise<PaginatedPaymentsResponseDto> {
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count(),
    ]);

    return {
      data: payments.map(toResponseDto),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    return toResponseDto(payment);
  }

  async findByOrderId(orderId: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }

    return toResponseDto(payment);
  }

  async getStats(): Promise<PaymentStatsResponseDto> {
    const grouped = await this.prisma.payment.groupBy({
      by: ['status'],
      _count: { status: true },
      _sum: { amountCents: true },
    });

    return {
      byStatus: grouped.map((item) => ({
        status: item.status,
        count: item._count.status,
        totalAmountCents: item._sum.amountCents || 0,
      })),
    };
  }
}

function toResponseDto(payment: Payment): PaymentResponseDto {
  return {
    id: payment.id,
    orderId: payment.orderId,
    amountCents: payment.amountCents,
    status: payment.status,
    failureReason: payment.failureReason,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}
