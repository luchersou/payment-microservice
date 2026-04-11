import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { DLQ } from '@messaging/rabbitmq/constants/dlq.constant';
import { PAYMENT_PROCESS_QUEUE_OPTIONS } from '@messaging/rabbitmq/config/queue-options.config';

import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { OrderCancelledEvent } from '@contracts/events/order-cancelled.event';

import { PaymentService } from './payment.service';

@Injectable()
export class PaymentConsumer {
  private readonly logger = new Logger(PaymentConsumer.name);

  constructor(private readonly paymentService: PaymentService) {}

  // ========================
  // ORDER CREATED
  // ========================
  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CREATED,
    queue: Queues.PAYMENT_PROCESS,
    queueOptions: PAYMENT_PROCESS_QUEUE_OPTIONS,
  })
  async handleOrderCreated(event: OrderCreatedEvent) {
    this.logger.log(`📥 Received OrderCreated: ${event.payload.orderId}`);

    try {
      await this.paymentService.handleOrderCreated(event.payload);
    } catch (error) {
      this.logger.error(
        `❌ Error processing OrderCreated for order ${event.payload.orderId}`,
        error,
      );

      throw error;
    }
  }

  // ========================
  // ORDER CANCELLED
  // ========================
  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CANCELLED,
    queue: Queues.PAYMENT_PROCESS,
    queueOptions: PAYMENT_PROCESS_QUEUE_OPTIONS,
  })
  async handleOrderCancelled(event: OrderCancelledEvent) {
    this.logger.log(`📥 Received OrderCancelled: ${event.payload.orderId}`);

    try {
      await this.paymentService.handleOrderCancelled(event.payload);
    } catch (error) {
      this.logger.error(
        `❌ Error processing OrderCancelled for order ${event.payload.orderId}`,
        error,
      );

      throw error;
    }
  }
}