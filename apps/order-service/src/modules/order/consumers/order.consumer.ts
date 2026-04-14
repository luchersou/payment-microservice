import { Injectable } from '@nestjs/common';

import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';

import { CorrelationLogger } from '@common/logger';
import { runWithCorrelation } from '@common/messaging';
import {
  Exchanges,
  ORDER_CANCEL_REQUESTED_QUEUE_OPTIONS,
  ORDER_CREATE_QUEUE_OPTIONS,
  ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
  Queues,
  RoutingKeys,
} from '@messaging/rabbitmq';
import {
  CreateOrderRequestedEvent,
  OrderCancelRequestedEvent,
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
} from '@contracts/events';
import { EventTypes } from '@contracts/types';

import { OrderService } from '../services/order.service';

type PaymentEvents =
  | PaymentApprovedEvent
  | PaymentDeclinedEvent
  | PaymentFailedEvent;

@Injectable()
export class OrderConsumer {
  private readonly logger = new CorrelationLogger(OrderConsumer.name);

  constructor(private readonly orderService: OrderService) {}

  // ========================
  // ORDER PROCESS QUEUE
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.CREATE_ORDER_REQUESTED,
    queue: Queues.ORDER_CREATE,
    queueOptions: ORDER_CREATE_QUEUE_OPTIONS,
  })
  async handleCreateOrderRequested(
    event: CreateOrderRequestedEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.log(
        `📥 Received CreateOrderRequested: ${event.payload.userId}`,
      );

      await this.orderService.createOrder(event.payload);
    });
  }

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CANCEL_REQUESTED,
    queue: Queues.ORDER_CANCEL_REQUESTED,
    queueOptions: ORDER_CANCEL_REQUESTED_QUEUE_OPTIONS,
  })
  async handleOrderCancelRequested(
    event: OrderCancelRequestedEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.log(
        `📥 Received OrderCancelRequested: ${event.payload.orderId}`,
      );

      await this.orderService.cancelByUser(event.payload.orderId);
    });
  }

  // ========================
  // PAYMENT RESULT
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.PAYMENTS,
    routingKey: [
      RoutingKeys.PAYMENT_APPROVED,
      RoutingKeys.PAYMENT_DECLINED,
      RoutingKeys.PAYMENT_FAILED,
    ],
    queue: Queues.ORDER_PAYMENT_RESULT,
    queueOptions: ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
  })
  async handlePaymentEvents(event: PaymentEvents, amqpMsg: ConsumeMessage) {
    await runWithCorrelation(amqpMsg, async () => {
      const { orderId } = event.payload;

      this.logger.log(`📥 ${event.eventType} received for order ${orderId}`);

      switch (event.eventType) {
        case EventTypes.PAYMENT_APPROVED:
          await this.orderService.completeOrder(orderId);
          break;

        case EventTypes.PAYMENT_DECLINED:
          await this.orderService.cancelByPaymentDeclined(orderId);
          break;

        case EventTypes.PAYMENT_FAILED:
          await this.orderService.failOrder(orderId);
          break;

        default:
          this.logger.error(`❌ Unknown payment event: ${event}`);
          break;
      }
    });
  }
}
