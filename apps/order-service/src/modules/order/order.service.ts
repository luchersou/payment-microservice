import { Injectable, Logger } from '@nestjs/common';
import { OrderCreatedPayload } from '@contracts/events/order-created.event';
import { OrderCancelledEvent } from '@contracts/events/order-cancelled.event';
import { OrderStatus } from '@database/prisma/generated/prisma/enums';
import { NotFoundException } from '@nestjs/common/exceptions/not-found.exception';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { PrismaService } from '@database/prisma/prisma.service';
import { Order } from '@database/prisma/generated/prisma/browser';
import { OrderResponseDto } from './dto/order-response.dto';
import { PaginatedOrdersResponseDto } from './dto/paginated-orders-response.dto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(page: number, limit: number): Promise<PaginatedOrdersResponseDto> {
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
      data: orders.map(order => ({
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

  async createOrder(payload: OrderCreatedPayload) {
    const order = await this.prisma.order.upsert({
      where: { id: payload.orderId },
      update: {},
      create: {
        id: payload.orderId,
        userId: payload.userId,
        total: payload.total,
        status: OrderStatus.PENDING_PAYMENT,
      },
    });

    this.logger.log(`✅ Order ${order.id} persisted`);

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
    return this.cancelOrderInternal(orderId, 'USER_REQUESTED');
  }

  async cancelByPaymentDeclined(orderId: string) {
    return this.cancelOrderInternal(orderId, 'PAYMENT_DECLINED');
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

  private async cancelOrderInternal(
    orderId: string,
    reason: string,
  ) {
  this.logger.warn(`⚠️ Attempting to cancel order ${orderId}`);

  const order = await this.waitForOrder(orderId);

  if (!order) {
    this.logger.warn(`⚠️ Order ${orderId} not found. Skipping.`);
    return;
  }

  if (order.status === OrderStatus.CANCELLED) {
    this.logger.warn(`⚠️ Order ${orderId} already cancelled.`);
    return order;
  }

  if (order.status === OrderStatus.PAID) {
    this.logger.warn(
      `⚠️ Cannot cancel order ${orderId} because it is already PAID.`,
    );
    return;
  }

  const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
      },
    });

    await this.emitOrderCancelled(updatedOrder, reason);

    this.logger.log(`✅ Order ${orderId} cancelled successfully`);

    return updatedOrder;
  }

  private async emitOrderCancelled(order: Order, reason: string) {
    const event = new OrderCancelledEvent({
      orderId: order.id,
      reason,
      cancelledAt: new Date(),
    });

    await this.rabbit.publish(
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CANCELLED,
      event,
    );
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