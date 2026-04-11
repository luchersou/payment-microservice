import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';

import { ORDER_PROCESS_QUEUE_OPTIONS,
  ORDER_PAYMENT_RESULT_QUEUE_OPTIONS
} from '@messaging/rabbitmq/config/queue-options.config';

import { CreateOrderRequestedEvent } from '@contracts/events/create-order-requested.event';
import { OrderCancelRequestedEvent } from '@contracts/events/order-cancel-requested.event';
import { PaymentApprovedEvent } from '@contracts/events/payment-approved.event';
import { PaymentDeclinedEvent } from '@contracts/events/payment-declined.event';
import { PaymentFailedEvent } from '@contracts/events/payment-failed.event';

import { OrderService } from './order.service';

@Injectable()
export class OrderConsumer {
  private readonly logger = new Logger(OrderConsumer.name);

  constructor(private readonly orderService: OrderService) {}

  // ========================
  // ORDER PROCESS QUEUE
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.CREATE_ORDER_REQUESTED,
    queue: Queues.ORDER_PROCESS,
    queueOptions: ORDER_PROCESS_QUEUE_OPTIONS,
  })
  async handleCreateOrderRequested(event: CreateOrderRequestedEvent) {
    this.logger.log(`📥 Received CreateOrderRequested: ${event.payload.userId}`);
    await this.orderService.createOrder(event.payload);
  }

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CANCEL_REQUESTED,
    queue: Queues.ORDER_PROCESS,
    queueOptions: ORDER_PROCESS_QUEUE_OPTIONS,
  })
  async handleOrderCancelRequested(event: OrderCancelRequestedEvent) {
    this.logger.log(`📥 Received OrderCancelRequested: ${event.payload.orderId}`);
    await this.orderService.cancelByUser(event.payload.orderId);
  }

  // ========================
  // PAYMENT RESULT
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.PAYMENTS,
    routingKey: RoutingKeys.PAYMENT_ALL,
    queue: Queues.ORDER_PAYMENT_RESULT,
    queueOptions: ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
  })
  async handlePaymentApproved(event: PaymentApprovedEvent) {
    this.logger.log(`📥 Received PaymentApproved for order ${event.payload.orderId}`);
    await this.orderService.completeOrder(event.payload.orderId);
  }

  @RabbitSubscribe({
    exchange: Exchanges.PAYMENTS,
    routingKey: RoutingKeys.PAYMENT_ALL,
    queue: Queues.ORDER_PAYMENT_RESULT,
    queueOptions: ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
  })
  async handlePaymentDeclined(event: PaymentDeclinedEvent) {
    this.logger.log(`📥 Received PaymentDeclined for order ${event.payload.orderId}`);
    await this.orderService.cancelByPaymentDeclined(event.payload.orderId);
  }

  @RabbitSubscribe({
    exchange: Exchanges.PAYMENTS,
    routingKey: RoutingKeys.PAYMENT_ALL,
    queue: Queues.ORDER_PAYMENT_RESULT,
    queueOptions: ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
  })
  async handlePaymentFailed(event: PaymentFailedEvent) {
    this.logger.log(`📥 Received PaymentFailed for order ${event.payload.orderId}`);
    await this.orderService.failOrder(event.payload.orderId);
  }
}