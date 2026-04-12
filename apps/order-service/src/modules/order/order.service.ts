import { Injectable } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common/exceptions/not-found.exception';
import { CorrelationIdService } from '@common/context/correlation-id.service';
import { CorrelationLogger } from '@common/logger/correlation-logger.service';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { OrderStatus } from '@order/prisma/generated/prisma/client';
import { Order } from '@order/prisma/generated/prisma/client';
import { PrismaService } from '@order/prisma/prisma.service';
import { randomUUID } from 'crypto';

import { 
  Exchanges, 
  RoutingKeys 
} from '@messaging/rabbitmq';
import { 
  CreateOrderRequestedPayload,
  OrderCancelledEvent,
  OrderCreatedEvent
} from '@contracts/events';
import { CancelReason } from '@contracts/types';

import { OrderResponseDto } from './dto/order-response.dto';
import { PaginatedOrdersResponseDto } from './dto/paginated-orders-response.dto';

@Injectable()
export class OrderService {
  private readonly logger = new CorrelationLogger(OrderService.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly prisma: PrismaService,
  ) {}

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
      data: orders.map((order) => ({
        id: order.id,
        userId: order.userId,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<OrderResponseDto> {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return {
      id: order.id,
      userId: order.userId,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  async createOrder(payload: CreateOrderRequestedPayload) {
    const orderId = randomUUID();

    const order = await this.prisma.order.create({
      data: {
        id: orderId,
        userId: payload.userId,
        total: payload.total,
        status: OrderStatus.PENDING_PAYMENT,
      },
    });

    this.logger.log(`✅ Order ${order.id} persisted`);

    const correlationId = CorrelationIdService.getId();

    const event = new OrderCreatedEvent(
      {
        orderId: order.id,
        userId: order.userId,
        total: order.total,
      },
      correlationId,
    );

    await this.amqpConnection.publish(
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CREATED,
      event,
      {
        correlationId,
      },
    );

    return order;
  }

  async completeOrder(orderId: string) {
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
      data: {
        status: OrderStatus.PAID,
      },
    });

    this.logger.log(`✅ Order ${orderId} marked as PAID`);

    return updated;
  }

  async cancelByUser(orderId: string) {
    return this.cancelOrderInternal(orderId, CancelReason.USER_REQUESTED);
  }

  async cancelByPaymentDeclined(orderId: string) {
    return this.cancelOrderInternal(orderId, CancelReason.PAYMENT_DECLINED);
  }

  async failOrder(orderId: string) {
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
      data: {
        status: OrderStatus.FAILED,
      },
    });
  }

  private async cancelOrderInternal(orderId: string, reason: CancelReason) {
    this.logger.warn(`⚠️ Attempting to cancel order ${orderId}`);

    const order = await this.waitForOrder(orderId);

    if (!order) {
      this.logger.warn(`⚠️ Order ${orderId} not found. Skipping.`);
      return;
    }

    if (
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.FAILED
    ) {
      this.logger.warn(`⚠️ Order ${orderId} already finalized.`);
      return order;
    }

    const newStatus =
      reason === CancelReason.PAYMENT_DECLINED
        ? OrderStatus.FAILED
        : OrderStatus.CANCELLED;

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: newStatus,
      },
    });

    const correlationId = CorrelationIdService.getId();

    const event = new OrderCancelledEvent(
      {
        orderId: updatedOrder.id,
        reason,
        cancelledAt: new Date(),
      },
      correlationId,
    );

    await this.amqpConnection.publish(
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CANCELLED,
      event,
      {
        correlationId,
      },
    );

    this.logger.log(`✅ Order ${orderId} updated to ${newStatus} successfully`);

    return updatedOrder;
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
