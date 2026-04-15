import { Injectable } from '@nestjs/common';

import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';

import { CorrelationLogger } from '@common/logger';
import { runWithCorrelation } from '@common/messaging';
import { DLQ, Exchanges } from '@messaging/rabbitmq';
import {
  CreateOrderRequestedEvent,
  OrderCancelRequestedEvent,
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
} from '@contracts/events';

import { OrderService } from '../services/order.service';
import { OrderMetricsService } from '../../metrics/metrics.service';

type PaymentEvents =
  | PaymentApprovedEvent
  | PaymentDeclinedEvent
  | PaymentFailedEvent;

@Injectable()
export class OrderDlqConsumer {
  private readonly logger = new CorrelationLogger(OrderDlqConsumer.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly metrics: OrderMetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.ORDER_CREATE,
    queue: DLQ.ORDER_CREATE,
    queueOptions: { durable: true },
  })
  async handleCreateOrderDlq(
    event: CreateOrderRequestedEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_CREATE}`);

      this.metrics.incrementDlqMessages(
        DLQ.ORDER_CREATE,
        amqpMsg.fields.routingKey,
      );

      await this.orderService.saveFailedMessage({
        queue: DLQ.ORDER_CREATE,
        routingKey: amqpMsg.fields.routingKey,
        payload: event,
        error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
      });
    });
  }

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.ORDER_CANCEL_REQUESTED,
    queue: DLQ.ORDER_CANCEL_REQUESTED,
    queueOptions: { durable: true },
  })
  async handleCancelRequestedDlq(
    event: OrderCancelRequestedEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(
        `☠️ DLQ received — queue: ${DLQ.ORDER_CANCEL_REQUESTED}`,
      );

      this.metrics.incrementDlqMessages(
        DLQ.ORDER_CANCEL_REQUESTED,
        amqpMsg.fields.routingKey,
      );

      await this.orderService.saveFailedMessage({
        queue: DLQ.ORDER_CANCEL_REQUESTED,
        routingKey: amqpMsg.fields.routingKey,
        payload: event,
        error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
      });
    });
  }

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.ORDER_PAYMENT_RESULT,
    queue: DLQ.ORDER_PAYMENT_RESULT,
    queueOptions: { durable: true },
  })
  async handlePaymentResultDlq(event: PaymentEvents, amqpMsg: ConsumeMessage) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_PAYMENT_RESULT}`);

      this.metrics.incrementDlqMessages(
        DLQ.ORDER_PAYMENT_RESULT,
        amqpMsg.fields.routingKey,
      );

      await this.orderService.saveFailedMessage({
        queue: DLQ.ORDER_PAYMENT_RESULT,
        routingKey: amqpMsg.fields.routingKey,
        payload: event,
        error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
      });
    });
  }
}