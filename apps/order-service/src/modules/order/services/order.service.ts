import { Injectable, NotFoundException } from '@nestjs/common';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  Order,
  OrderStatus,
  Prisma,
} from '@order/prisma/generated/prisma/client';
import { PrismaService } from '@order/prisma/prisma.service';
import { randomUUID } from 'crypto';

import { CorrelationIdService } from '@common/context';
import { CorrelationLogger } from '@common/logger';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import {
  CreateOrderRequestedPayload,
  OrderCancelledEvent,
  OrderCreatedEvent,
} from '@contracts/events';
import { CancelReason } from '@contracts/types';
import { MetricNames } from '@contracts/types';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderResponseDto } from '../dto/order-response.dto';
import { PaginatedOrdersResponseDto } from '../dto/paginated-orders-response.dto';

@Injectable()
export class OrderService {
  private readonly logger = new CorrelationLogger(OrderService.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly prisma: PrismaService,
    private readonly metrics: OrderMetricsService,
  ) {}

  // ─────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────

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
      data: orders.map((order) => this.toResponseDto(order)),
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

    return this.toResponseDto(order);
  }

  // ─────────────────────────────────────────────
  // COMMANDS
  // ─────────────────────────────────────────────

  async createOrder(payload: CreateOrderRequestedPayload) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.CREATE_ORDER_REQUEST_DURATION,
    );

    try {
      const order = await this.prisma.order.create({
        data: {
          id: randomUUID(),
          userId: payload.userId,
          total: payload.total,
          status: OrderStatus.PENDING_PAYMENT,
        },
      });

      this.logger.log(`✅ Order ${order.id} persisted`);
      this.metrics.incrementOrdersCreated();

      const correlationId = CorrelationIdService.getId();

      await this.amqpConnection.publish(
        Exchanges.ORDERS,
        RoutingKeys.ORDER_CREATED,
        new OrderCreatedEvent(
          { orderId: order.id, userId: order.userId, total: order.total },
          correlationId,
        ),
        { correlationId },
      );

      return order;
    } finally {
      endTimer();
    }
  }

  async completeOrder(orderId: string) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.ORDER_PAYMENT_RESULT_PROCESSING_DURATION,
    );
    try {
      this.logger.log(`✅ Completing order ${orderId}`);

      const order = await this.waitForOrder(orderId);

      if (!order) {
        this.logger.warn(
          `⚠️ Order ${orderId} not found. Ignoring PaymentApproved event.`,
        );
        return;
      }

      if (order.status === OrderStatus.PAID) {
        this.logger.log(`✅ Order ${orderId} already paid. Skipping.`);
        return order;
      }

      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        this.logger.warn(
          `⚠️ Cannot complete order ${orderId} with status ${order.status}`,
        );
        return;
      }

      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID },
      });

      this.logger.log(`✅ Order ${orderId} marked as PAID`);
      this.metrics.incrementOrdersCompleted();

      return updated;
    } finally {
      endTimer();
    }
  }

  async cancelByUser(orderId: string) {
    return this.cancelOrderInternal(orderId, CancelReason.USER_REQUESTED);
  }

  async cancelByPaymentDeclined(orderId: string) {
    return this.cancelOrderInternal(orderId, CancelReason.PAYMENT_DECLINED);
  }

  async failOrder(orderId: string) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.ORDER_PAYMENT_RESULT_PROCESSING_DURATION,
    );
    try {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (!order) {
        this.logger.warn(
          `⚠️ Order ${orderId} not found. Ignoring PaymentDeclined.`,
        );
        return;
      }

      if (order.status === OrderStatus.FAILED) {
        return;
      }

      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.FAILED },
      });

      this.metrics.incrementOrdersFailed();
    } finally {
      endTimer();
    }
  }

  async saveFailedMessage(data: {
    queue: string;
    routingKey: string;
    payload: unknown;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.failedMessage.create({
        data: {
          queue: data.queue,
          routingKey: data.routingKey,
          payload: data.payload as object,
          error: data.error,
        },
      });

      this.logger.log(
        `💾 Failed message saved — queue: ${data.queue} | routingKey: ${data.routingKey}`,
      );
    } catch (err) {
      this.logger.error(
        `❌ Could not save failed message to database — queue: ${data.queue} | routingKey: ${data.routingKey}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — ORDER CANCELLATION
  // ─────────────────────────────────────────────

  private async cancelOrderInternal(orderId: string, reason: CancelReason) {
    const metric =
      reason === CancelReason.PAYMENT_DECLINED
        ? MetricNames.PAYMENT_DECLINE_DURATION
        : MetricNames.ORDER_CANCEL_REQUEST_DURATION;

    const endTimer = this.metrics.startMessageProcessingTimer(metric);
    try {
      this.logger.warn(`⚠️ Attempting to cancel order ${orderId}`);

      const order = await this.waitForOrder(orderId);

      if (!order) {
        this.logger.warn(`⚠️ Order ${orderId} not found. Skipping.`);
        return;
      }

      const newStatus =
        reason === CancelReason.PAYMENT_DECLINED
          ? OrderStatus.FAILED
          : OrderStatus.CANCELLED;

      try {
        const updatedOrder = await this.prisma.order.update({
          where: {
            id: orderId,
            status: { notIn: [OrderStatus.CANCELLED, OrderStatus.FAILED] },
          },
          data: { status: newStatus },
        });

        const correlationId = CorrelationIdService.getId();

        await this.amqpConnection.publish(
          Exchanges.ORDERS,
          RoutingKeys.ORDER_CANCELLED,
          new OrderCancelledEvent(
            { orderId: updatedOrder.id, reason, cancelledAt: new Date() },
            correlationId,
          ),
          { correlationId },
        );

        this.logger.log(
          `✅ Order ${orderId} updated to ${newStatus} successfully`,
        );

        this.metrics.incrementOrdersCancelled(reason);

        return updatedOrder;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          this.logger.warn(`⚠️ Order ${orderId} already finalized. Skipping.`);
          return;
        }
        throw error;
      }
    } finally {
      endTimer();
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — HELPERS
  // ─────────────────────────────────────────────

  private toResponseDto(order: Order): OrderResponseDto {
    return {
      id: order.id,
      userId: order.userId,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  private async waitForOrder(
    orderId: string,
    maxRetries = 5,
    delayMs = 300,
  ): Promise<Order | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
      });

      if (order) {
        if (attempt > 1) {
          this.logger.log(
            `✅ Order ${orderId} found on retry ${attempt}/${maxRetries}`,
          );
        }
        return order;
      }

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return null;
  }
}
