import { Injectable, NotFoundException } from '@nestjs/common';

import type { Order, Prisma } from '@order/prisma/generated/prisma/client';
import { OrderStatus } from '@order/prisma/generated/prisma/enums';
import { PrismaService } from '@order/prisma/prisma.service';
import { randomUUID } from 'crypto';

import { CorrelationIdService } from '@common/context';
import { CorrelationLogger } from '@common/logger';
import { toOutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
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

/** The PrismaService itself, or the client of an interactive transaction */
type Db = Prisma.TransactionClient;

@Injectable()
export class OrderService {
  private readonly logger = new CorrelationLogger(OrderService.name);

  constructor(
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
   * Idempotent on payload.orderId: a redelivered request finds the existing
   * order and does nothing. OrderCreated is written to the outbox in the same
   * transaction as the order, so an order never exists without its event and
   * there is nothing to republish.
   *
   * If the order was cancelled before this request was handled, a CANCELLED
   * tombstone already holds the id, so OrderCreated is never written.
   */
  async createOrder(payload: CreateOrderRequestedPayload) {
    // Fallback for requests published before the gateway sent orderId
    const orderId = payload.orderId ?? randomUUID();
    const { order, created } = await this.findOrCreateOrder(orderId, payload);

    if (created) {
      this.logger.log(`✅ Order ${order.id} persisted`);
      this.metrics.incrementOrdersCreated();
    } else {
      this.logger.warn(
        `⚠️ Order ${order.id} already exists as ${order.status}, nothing to do`,
      );
    }

    return order;
  }

  async completeOrder(orderId: string) {
    const { order, changed } = await this.transition(
      this.prisma,
      orderId,
      OrderStatus.PAID,
    );

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

  /**
   * The only source of OrderCancelled: payment results never cancel an
   * order, a declined or failed payment fails it (see failOrder).
   */
  async cancelByUser(orderId: string) {
    this.logger.warn(`⚠️ Attempting to cancel order ${orderId}`);

    let result: { order: Order; changed: boolean };

    try {
      result = await this.prisma.$transaction((tx) =>
        this.cancelInTransaction(tx, orderId),
      );
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      // The create request persisted the order between the update and the
      // tombstone insert, so now it exists and is cancelled normally
      result = await this.prisma.$transaction((tx) =>
        this.cancelInTransaction(tx, orderId),
      );
    }

    const { order, changed } = result;

    if (changed) {
      this.logger.log(`✅ Order ${orderId} updated to CANCELLED successfully`);
      this.metrics.incrementOrdersCancelled(CancelReason.USER_REQUESTED);
    } else if (order.status === OrderStatus.CANCELLED) {
      this.logger.log(`ℹ️ Order ${orderId} already CANCELLED. Skipping.`);
    } else {
      this.logger.warn(
        `⚠️ Cannot cancel order ${orderId} with status ${order.status}. Skipping.`,
      );
    }

    return order;
  }

  /**
   * Handles both PaymentDeclined and PaymentFailed. Publishes nothing: the
   * payment is already final (DECLINED/FAILED), so there is nothing for the
   * payment service to compensate.
   */
  async failOrder(orderId: string) {
    const { order, changed } = await this.transition(
      this.prisma,
      orderId,
      OrderStatus.FAILED,
    );

    if (!order) {
      this.logger.warn(
        `⚠️ Order ${orderId} not found. Ignoring payment result.`,
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

  /**
   * Cancels the order and writes OrderCancelled to the outbox atomically.
   *
   * The gateway returns the orderId before the order exists, so a cancel can
   * be handled before its create request. Instead of waiting for the order
   * (a bounded retry that, once exhausted, let it be created and charged),
   * the id is taken by a CANCELLED tombstone the later create will find. The
   * insert throws P2002 if the create won the race; the caller retries.
   */
  private async cancelInTransaction(
    tx: Db,
    orderId: string,
  ): Promise<{ order: Order; changed: boolean }> {
    const { order, changed } = await this.transition(
      tx,
      orderId,
      OrderStatus.CANCELLED,
    );

    if (!order) {
      const tombstone = await tx.order.create({
        data: { id: orderId, status: OrderStatus.CANCELLED },
      });

      this.logger.log(
        `🪦 Order ${orderId} recorded as CANCELLED before being created`,
      );
      await this.enqueueOrderCancelled(tx, tombstone);
      return { order: tombstone, changed: true };
    }

    if (changed) {
      await this.enqueueOrderCancelled(tx, order);
    }

    return { order, changed };
  }

  private async enqueueOrderCancelled(tx: Db, order: Order) {
    await tx.outboxMessage.create({
      data: toOutboxRecord(
        Exchanges.ORDERS,
        RoutingKeys.ORDER_CANCELLED,
        new OrderCancelledEvent(
          {
            orderId: order.id,
            reason: CancelReason.USER_REQUESTED,
            cancelledAt: order.updatedAt,
          },
          CorrelationIdService.getId(),
        ),
      ),
    });
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
    db: Db,
    orderId: string,
    to: OrderStatus,
  ): Promise<{ order: Order | null; changed: boolean }> {
    const { count } = await db.order.updateMany({
      where: { id: orderId, status: { in: sourceStatusesFor(to) } },
      data: { status: to },
    });

    const order = await db.order.findUnique({
      where: { id: orderId },
    });

    return { order, changed: count === 1 };
  }

  private async findOrCreateOrder(
    orderId: string,
    payload: CreateOrderRequestedPayload,
  ): Promise<{ order: Order; created: boolean }> {
    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            id: orderId,
            userId: payload.userId,
            total: payload.total,
            status: OrderStatus.PENDING_PAYMENT,
          },
        });

        await tx.outboxMessage.create({
          data: toOutboxRecord(
            Exchanges.ORDERS,
            RoutingKeys.ORDER_CREATED,
            new OrderCreatedEvent(
              { orderId, userId: payload.userId, total: payload.total },
              CorrelationIdService.getId(),
            ),
          ),
        });

        return order;
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
