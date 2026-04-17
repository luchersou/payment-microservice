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
import { MetricNames } from '@contracts/types';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderService } from '../services/order.service';

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
    event: CreateOrderRequestedEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_CREATE}`);

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.ORDER_CREATE_DLQ_PROCESSING_DURATION,
      );

      try {
        this.metrics.incrementDlqMessages(
          MetricNames.ORDER_CREATE_DLQ_COUNT,
          amqpMsg.fields.routingKey,
        );

        await this.orderService.saveFailedMessage({
          queue: DLQ.ORDER_CREATE,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.ORDER_CREATE}`,
        );
      } finally {
        endTimer();
      }
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
    event: OrderCancelRequestedEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(
        `☠️ DLQ received — queue: ${DLQ.ORDER_CANCEL_REQUESTED}`,
      );

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.ORDER_CANCEL_REQUESTED_DLQ_PROCESSING_DURATION,
      );

      try {
        this.metrics.incrementDlqMessages(
          MetricNames.ORDER_CANCEL_REQUESTED_DLQ_COUNT,
          amqpMsg.fields.routingKey,
        );

        await this.orderService.saveFailedMessage({
          queue: DLQ.ORDER_CANCEL_REQUESTED,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.ORDER_CANCEL_REQUESTED}`,
        );
      } finally {
        endTimer();
      }
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
  async handlePaymentResultDlq(event: PaymentEvents, amqpMsg: ConsumeMessage) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_PAYMENT_RESULT}`);

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.ORDER_PAYMENT_RESULT_DLQ_PROCESSING_DURATION,
      );

      try {
        this.metrics.incrementDlqMessages(
          MetricNames.ORDER_PAYMENT_RESULT_DLQ_COUNT,
          amqpMsg.fields.routingKey,
        );

        await this.orderService.saveFailedMessage({
          queue: DLQ.ORDER_PAYMENT_RESULT,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: amqpMsg.properties.headers?.['x-death']?.[0]?.reason,
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.ORDER_PAYMENT_RESULT}`,
        );
      } finally {
        endTimer();
      }
    });
  }
}
