import { Injectable, NotFoundException } from '@nestjs/common';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import type { Order } from '@order/prisma/generated/prisma/client';
import { OrderStatus } from '@order/prisma/generated/prisma/enums';
import { PrismaService } from '@order/prisma/prisma.service';
import { randomUUID } from 'crypto';

import { CorrelationIdService } from '@common/context';
import { CorrelationLogger } from '@common/logger';
import { Exchanges, publishEvent, RoutingKeys } from '@messaging/rabbitmq';
import {
  CancelReason,
  CreateOrderRequestedPayload,
  OrderCancelledEvent,
  OrderCreatedEvent,
} from '@contracts/order-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { sourceStatusesFor } from '../domain/order-state-machine';
import { OrderResponseDto } from '../dto/order-response.dto';
import { PaginatedOrdersResponseDto } from '../dto/paginated-orders-response.dto';

/**
 * Thrown when a cancel request arrives before the order is persisted
 * (the gateway returns the orderId before the order is created).
 * The retry error handler redelivers the message later.
 */
export class OrderNotFoundYetError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} not found yet`);
    this.name = OrderNotFoundYetError.name;
  }
}

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

  /**
   * Idempotent on payload.orderId: a redelivered request reuses the
   * existing order and republishes OrderCreated while it is still pending,
   * covering the case where the previous attempt persisted but failed to
   * publish. The payment service is idempotent on orderId.
   */
  async createOrder(payload: CreateOrderRequestedPayload) {
    // Fallback for requests published before the gateway sent orderId
    const orderId = payload.orderId ?? randomUUID();
    const { order, created } = await this.findOrCreateOrder(orderId, payload);

    if (created) {
      this.logger.log(`✅ Order ${order.id} persisted`);
      this.metrics.incrementOrdersCreated();
    } else {
      this.logger.warn(`⚠️ Order ${order.id} already exists (redelivery)`);
    }

    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      this.logger.log(
        `ℹ️ Order ${order.id} is ${order.status}, OrderCreated not republished`,
      );
      return order;
    }

    const correlationId = CorrelationIdService.getId();

    await publishEvent(
      this.amqpConnection,
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CREATED,
      new OrderCreatedEvent(
        { orderId: order.id, userId: order.userId, total: order.total },
        correlationId,
      ),
    );

    return order;
  }

  async completeOrder(orderId: string) {
    const { order, changed } = await this.transition(orderId, OrderStatus.PAID);

    if (!order) {
      this.logger.warn(
        `⚠️ Order ${orderId} not found. Ignoring PaymentApproved event.`,
      );
      return;
    }

    if (changed) {
      this.logger.log(`✅ Order ${orderId} marked as PAID`);
      this.metrics.incrementOrdersCompleted();
    } else if (order.status === OrderStatus.PAID) {
      this.logger.log(`✅ Order ${orderId} already paid. Skipping.`);
    } else {
      this.logger.warn(
        `⚠️ Cannot complete order ${orderId} with status ${order.status}`,
      );
    }

    return order;
  }

  async cancelByUser(orderId: string) {
    return this.cancelOrderInternal(orderId, CancelReason.USER_REQUESTED);
  }

  async cancelByPaymentDeclined(orderId: string) {
    return this.cancelOrderInternal(orderId, CancelReason.PAYMENT_DECLINED);
  }

  async failOrder(orderId: string) {
    const { order, changed } = await this.transition(
      orderId,
      OrderStatus.FAILED,
    );

    if (!order) {
      this.logger.warn(
        `⚠️ Order ${orderId} not found. Ignoring PaymentFailed.`,
      );
      return;
    }

    if (changed) {
      this.logger.warn(`⚠️ Order ${orderId} marked as FAILED`);
      this.metrics.incrementOrdersFailed();
    } else if (order.status !== OrderStatus.FAILED) {
      this.logger.warn(
        `⚠️ Cannot fail order ${orderId} with status ${order.status}`,
      );
    }

    return order;
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
      throw err;
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — ORDER CANCELLATION
  // ─────────────────────────────────────────────

  private async cancelOrderInternal(orderId: string, reason: CancelReason) {
    this.logger.warn(`⚠️ Attempting to cancel order ${orderId}`);

    const target =
      reason === CancelReason.PAYMENT_DECLINED
        ? OrderStatus.FAILED
        : OrderStatus.CANCELLED;

    const { order, changed } = await this.transition(orderId, target);

    if (!order) {
      if (reason === CancelReason.USER_REQUESTED) {
        throw new OrderNotFoundYetError(orderId);
      }
      this.logger.warn(`⚠️ Order ${orderId} not found. Skipping.`);
      return;
    }

    if (!changed && order.status !== target) {
      this.logger.warn(
        `⚠️ Cannot cancel order ${orderId} with status ${order.status}. Skipping.`,
      );
      return;
    }

    // Published when the transition happened now, and republished when the
    // order is already in the target status (redelivery after a failed
    // publish). The payment service handles OrderCancelled idempotently.
    const correlationId = CorrelationIdService.getId();

    await publishEvent(
      this.amqpConnection,
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CANCELLED,
      new OrderCancelledEvent(
        { orderId: order.id, reason, cancelledAt: order.updatedAt },
        correlationId,
      ),
    );

    if (changed) {
      this.logger.log(`✅ Order ${orderId} updated to ${target} successfully`);
      this.metrics.incrementOrdersCancelled(reason);
    } else {
      this.logger.warn(
        `⚠️ Order ${orderId} already ${target}. OrderCancelled republished.`,
      );
    }

    return order;
  }

  // ─────────────────────────────────────────────
  // PRIVATE — HELPERS
  // ─────────────────────────────────────────────

  /**
   * Atomic conditional update: only moves the order to `to` if its current
   * status allows it (see ORDER_TRANSITIONS), so concurrent events cannot
   * overwrite each other. Returns the current order and whether it changed.
   */
  private async transition(
    orderId: string,
    to: OrderStatus,
  ): Promise<{ order: Order | null; changed: boolean }> {
    const { count } = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: sourceStatusesFor(to) } },
      data: { status: to },
    });

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    return { order, changed: count === 1 };
  }

  private async findOrCreateOrder(
    orderId: string,
    payload: CreateOrderRequestedPayload,
  ): Promise<{ order: Order; created: boolean }> {
    try {
      const order = await this.prisma.order.create({
        data: {
          id: orderId,
          userId: payload.userId,
          total: payload.total,
          status: OrderStatus.PENDING_PAYMENT,
        },
      });
      return { order, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const order = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      return { order, created: false };
    }
  }

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
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
