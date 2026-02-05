import { Injectable, Logger  } from '@nestjs/common';
import { OrderRepository } from './order.repository';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { OrderStatus } from '@database/prisma/generated/prisma/client';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { CreateOrderDto } from '@contracts/dto/create-order.dto';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly rabbit: RabbitMQService,
  ) {}

  async createOrder(payload: CreateOrderDto) {
    const order = await this.orderRepo.create(payload);

    const event = new OrderCreatedEvent({
      orderId: order.id,
      amount: order.total,
    });

    await this.rabbit.publish(Exchanges.ORDERS, RoutingKeys.ORDER_CREATED, event);

    return order;
  }

  async completeOrder(orderId: string) {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.COMPLETED) {
      this.logger.warn(`Order ${orderId} already completed`);
      return order; 
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new Error(`Cannot complete cancelled order ${orderId}`);
    }

    return this.orderRepo.updateStatus(orderId, OrderStatus.COMPLETED);
  }

  async cancelOrder(orderId: string) {
    const order = await this.orderRepo.findById(orderId);

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (order.status === OrderStatus.CANCELLED) {
      this.logger.warn(`Order ${orderId} already cancelled`);
      return order; 
    }

    if (order.status === OrderStatus.COMPLETED) {
      throw new Error(`Cannot cancel completed order ${orderId}`);
    }

    return this.orderRepo.updateStatus(orderId, OrderStatus.CANCELLED);
  }
}
