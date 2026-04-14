import { Injectable } from '@nestjs/common';

import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';

import { CorrelationLogger } from '@common/logger';
import { runWithCorrelation } from '@common/messaging';
import {
  DLQ,
  Exchanges,
} from '@messaging/rabbitmq';

import { OrderService } from '../services/order.service';

@Injectable()
export class OrderDlqConsumer {
  private readonly logger = new CorrelationLogger(OrderDlqConsumer.name);

  constructor(private readonly orderService: OrderService) {}

  // ========================
  // ORDER CREATE DLQ
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.ORDER_CREATE,
    queue: DLQ.ORDER_CREATE,
    queueOptions: { durable: true },
  })
  async handleCreateOrderDlq(
    event: unknown,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_CREATE}`);

      await this.orderService.saveFailedMessage({
        queue: DLQ.ORDER_CREATE,
        routingKey: amqpMsg.fields.routingKey,
        payload: event,
        error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
      });
    });
  }

  // ========================
  // ORDER CANCEL REQUESTED DLQ
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.ORDER_CANCEL_REQUESTED,
    queue: DLQ.ORDER_CANCEL_REQUESTED,
    queueOptions: { durable: true },
  })
  async handleCancelRequestedDlq(
    event: unknown,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_CANCEL_REQUESTED}`);

      await this.orderService.saveFailedMessage({
        queue: DLQ.ORDER_CANCEL_REQUESTED,
        routingKey: amqpMsg.fields.routingKey,
        payload: event,
        error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
      });
    });
  }

  // ========================
  // ORDER PAYMENT RESULT DLQ
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.ORDER_PAYMENT_RESULT,
    queue: DLQ.ORDER_PAYMENT_RESULT,
    queueOptions: { durable: true },
  })
  async handlePaymentResultDlq(
    event: unknown,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_PAYMENT_RESULT}`);

      await this.orderService.saveFailedMessage({
        queue: DLQ.ORDER_PAYMENT_RESULT,
        routingKey: amqpMsg.fields.routingKey,
        payload: event,
        error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
      });
    });
  }
}