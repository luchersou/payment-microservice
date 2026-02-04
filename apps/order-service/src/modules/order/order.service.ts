import { Injectable } from '@nestjs/common';
import { OrderRepository } from './order.repository';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { OrderStatus } from '@database/prisma/generated/prisma/client';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';

@Injectable()
export class OrderService {
  constructor(
    private readonly orderRepo: OrderRepository,
    private readonly rabbit: RabbitMQService,
  ) {}

  async createOrder(payload: {
    customerId: string;
    items: { product: string; price: number; quantity: number }[];
  }) {
    const order = await this.orderRepo.create(payload);

    const event = new OrderCreatedEvent({
      orderId: order.id,
      amount: order.total,
    });

    await this.rabbit.publish(Exchanges.ORDERS, RoutingKeys.ORDER_CREATED, event);

    return order;
  }

  async completeOrder(orderId: string) {
    return this.orderRepo.updateStatus(orderId, OrderStatus.COMPLETED);
  }

  async cancelOrder(orderId: string) {
    return this.orderRepo.updateStatus(orderId, OrderStatus.CANCELLED);
  }
}
