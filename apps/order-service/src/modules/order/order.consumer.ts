import { Injectable } from '@nestjs/common';
import { CorrelationLogger } from '@common/logger/correlation-logger.service';
import { runWithCorrelation } from '@common/messaging/run-with-correlation';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';

import {
  ORDER_CANCEL_REQUESTED_QUEUE_OPTIONS,
  ORDER_CREATE_QUEUE_OPTIONS,
  ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
} from '@messaging/rabbitmq/config/queue-options.config';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { CreateOrderRequestedEvent } from '@contracts/events/create-order-requested.event';
import { OrderCancelRequestedEvent } from '@contracts/events/order-cancel-requested.event';
import { PaymentApprovedEvent } from '@contracts/events/payment-approved.event';
import { PaymentDeclinedEvent } from '@contracts/events/payment-declined.event';
import { PaymentFailedEvent } from '@contracts/events/payment-failed.event';
import { EventTypes } from '@contracts/types/event-types.enum';

import { OrderService } from './order.service';

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
