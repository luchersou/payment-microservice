import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CorrelationIdService } from '@common/context';
import { CorrelationLogger } from '@common/logger/correlation-logger.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { Payment } from '@payment/prisma/generated/prisma/client';
import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';
import { PrismaService } from '@payment/prisma/prisma.service';

import { Exchanges,
  RoutingKeys,
} from '@messaging/rabbitmq';
import { OrderCancelledPayload,
  OrderCreatedPayload,
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
} from '@contracts/events';

import { PaginatedPaymentsResponseDto } from './dto/paginated-payments-response.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentStatsResponseDto } from './dto/payment-stats-response.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new CorrelationLogger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

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
      data: payments.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        status: payment.status,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  async findByOrderId(orderId: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }

    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  async getStats(): Promise<PaymentStatsResponseDto> {
    const grouped = await this.prisma.payment.groupBy({
      by: ['status'],
      _count: { status: true },
      _sum: { amount: true },
    });

    return {
      byStatus: grouped.map((item) => ({
        status: item.status,
        count: item._count.status,
        totalAmount: item._sum.amount || 0,
      })),
    };
  }

  async handleOrderCreated(payload: OrderCreatedPayload) {
    this.logger.log(`💳 Processing payment for order ${payload.orderId}`);

    let payment: Payment | null = null;

    try {
      payment = await this.prisma.payment.create({
        data: {
          orderId: payload.orderId,
          amount: payload.total,
          status: PaymentStatus.PROCESSING,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        this.logger.warn(
          `⚠️ Payment already exists for order ${payload.orderId} (idempotent skip)`,
        );
        return;
      }

      this.logger.error(
        `❌ Failed to create payment for order ${payload.orderId}`,
        error,
      );
      throw error;
    }

    try {
      const result = await this.simulatePaymentGateway(payload.total);

      if (result.approved) {
        await this.approvePayment(payment.id, payload.orderId);
      } else {
        await this.declinePayment(
          payment.id,
          payload.orderId,
          result.reason ?? 'Payment declined',
        );
      }
    } catch (error) {
      this.logger.error(
        `❌ Unexpected error while processing payment for order ${payload.orderId}`,
      );

      await this.failPayment(payload.orderId, error);
    }
  }

  async handleOrderCancelled(payload: OrderCancelledPayload) {
    this.logger.log(`🚫 Cancelling payment for order ${payload.orderId}`);

    const payment = await this.prisma.payment.findUnique({
      where: { orderId: payload.orderId },
    });

    if (!payment) {
      this.logger.warn(`⚠️ No payment found for order ${payload.orderId}`);
      return;
    }

    switch (payment.status) {
      case PaymentStatus.APPROVED:
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.REFUNDED,
          },
        });

        this.logger.log(
          `💰 Payment ${payment.id} marked as REFUNDED for order ${payload.orderId}`,
        );
        return;

      case PaymentStatus.PROCESSING:
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.DECLINED,
          },
        });

        this.logger.log(
          `✅ Payment ${payment.id} declined due to order cancellation`,
        );

        return;

      case PaymentStatus.DECLINED:
      case PaymentStatus.FAILED:
        this.logger.warn(`⚠️ Payment ${payment.id} already ${payment.status}`);
        return;

      default:
        this.logger.warn(`⚠️ Unknown payment status ${payment.status}`);
    }
  }

  private async approvePayment(paymentId: string, orderId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    if (payment.status !== PaymentStatus.PROCESSING) {
      this.logger.warn(
        `⚠️ Payment ${paymentId} is ${payment.status}, cannot approve`,
      );
      return;
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.APPROVED,
      },
    });

    const correlationId = CorrelationIdService.getId();

    const event = new PaymentApprovedEvent(
      {
        orderId,
        transactionId: paymentId,
      },
      correlationId,
    );

    await this.amqpConnection.publish(
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_APPROVED,
      event,
      {
        correlationId,
      },
    );

    this.logger.log(`✅ Payment approved for order ${orderId}`);
  }

  private async declinePayment(
    paymentId: string,
    orderId: string,
    reason?: string,
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    if (payment.status !== PaymentStatus.PROCESSING) {
      this.logger.warn(
        `⚠️ Payment ${paymentId} is ${payment.status}, cannot decline`,
      );
      return;
    }

    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: PaymentStatus.DECLINED,
      },
    });

    const correlationId = CorrelationIdService.getId();

    const event = new PaymentDeclinedEvent(
      {
        orderId,
        reason: reason ?? 'Insufficient funds',
      },
      correlationId,
    );

    await this.amqpConnection.publish(
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_DECLINED,
      event,
      {
        correlationId,
      },
    );

    this.logger.warn(`⚠️ Payment declined for order ${orderId}`);
  }

  private async failPayment(orderId: string, error: any) {
    this.logger.error(`❌ Payment failed for order ${orderId}`, error);

    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
        },
      });
    }

    const correlationId = CorrelationIdService.getId();

    const event = new PaymentFailedEvent(
      {
        orderId,
        error: error?.message ?? 'Unknown error',
      },
      correlationId,
    );

    await this.amqpConnection.publish(
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_FAILED,
      event,
      {
        correlationId,
      },
    );
  }

  // ─────────────────────────────────────────────
  // SIMULATED PAYMENT GATEWAY
  // ─────────────────────────────────────────────

  private async simulatePaymentGateway(
    amount: number,
  ): Promise<{ approved: boolean; reason?: string }> {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const random = Math.random();

    /**
     * 20% of the time, the payment is declined due to insufficient funds
     */
    if (random < 0.2) {
      return {
        approved: false,
        reason: 'Insufficient funds',
      };
    }

    return { approved: true };
  }
}
