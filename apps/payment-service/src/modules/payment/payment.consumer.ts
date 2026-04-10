import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { OrderCancelledEvent } from '@contracts/events/order-cancelled.event';

import { PaymentService } from './payment.service';

@Injectable()
export class PaymentConsumer {
  private readonly logger = new Logger(PaymentConsumer.name);

  constructor(private readonly paymentService: PaymentService) {}

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CREATED,
    queue: Queues.PAYMENT_PROCESS,
  })
  async handleOrderCreated(event: OrderCreatedEvent) {
    this.logger.log(`📥 Received OrderCreated: ${event.payload.orderId}`);
    await this.paymentService.handleOrderCreated(event.payload);
  }

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CANCELLED,
    queue: Queues.PAYMENT_PROCESS,
  })
  async handleOrderCancelled(event: OrderCancelledEvent) {
    this.logger.log(`📥 Received OrderCancelled: ${event.payload.orderId}`);
    await this.paymentService.handleOrderCancelled(event.payload);
  }
}