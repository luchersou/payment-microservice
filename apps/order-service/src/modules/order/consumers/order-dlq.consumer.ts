import { Injectable } from '@nestjs/common';

import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';

import { CorrelationLogger } from '@common/logger';
import { runWithCorrelation } from '@common/messaging';
import { MetricNames } from '@common/metrics';
import {
  createDelayedRequeueErrorHandler,
  DLQ,
  DLQ_QUEUE_OPTIONS,
  Exchanges,
  getDeadLetterReason,
} from '@messaging/rabbitmq';
import {
  CreateOrderRequestedEvent,
  OrderCancelRequestedEvent,
} from '@contracts/order-events';
import {
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
  PaymentRefundedEvent,
} from '@contracts/payment-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { PrismaFailedMessageRepository } from '../infra/prisma-failed-message.repository';

type PaymentEvents =
  | PaymentApprovedEvent
  | PaymentDeclinedEvent
  | PaymentFailedEvent
  | PaymentRefundedEvent;

@Injectable()
export class OrderDlqConsumer {
  private readonly logger = new CorrelationLogger(OrderDlqConsumer.name);

  constructor(
    private readonly failedMessages: PrismaFailedMessageRepository,
    private readonly metrics: OrderMetricsService,
  ) {}

  // ========================
  // ORDER CREATE DLQ
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.ORDER_CREATE,
    queue: DLQ.ORDER_CREATE,
    queueOptions: DLQ_QUEUE_OPTIONS,
    errorHandler: createDelayedRequeueErrorHandler(),
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
          DLQ.ORDER_CREATE,
          amqpMsg.fields.routingKey,
        );

        await this.failedMessages.save({
          queue: DLQ.ORDER_CREATE,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: getDeadLetterReason(amqpMsg),
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.ORDER_CREATE}`,
        );
        throw error;
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
    queueOptions: DLQ_QUEUE_OPTIONS,
    errorHandler: createDelayedRequeueErrorHandler(),
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
          DLQ.ORDER_CANCEL_REQUESTED,
          amqpMsg.fields.routingKey,
        );

        await this.failedMessages.save({
          queue: DLQ.ORDER_CANCEL_REQUESTED,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: getDeadLetterReason(amqpMsg),
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.ORDER_CANCEL_REQUESTED}`,
        );
        throw error;
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
    queueOptions: DLQ_QUEUE_OPTIONS,
    errorHandler: createDelayedRequeueErrorHandler(),
  })
  async handlePaymentResultDlq(event: PaymentEvents, amqpMsg: ConsumeMessage) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.ORDER_PAYMENT_RESULT}`);

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.ORDER_PAYMENT_RESULT_DLQ_PROCESSING_DURATION,
      );

      try {
        this.metrics.incrementDlqMessages(
          DLQ.ORDER_PAYMENT_RESULT,
          amqpMsg.fields.routingKey,
        );

        await this.failedMessages.save({
          queue: DLQ.ORDER_PAYMENT_RESULT,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: getDeadLetterReason(amqpMsg),
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.ORDER_PAYMENT_RESULT}`,
        );
        throw error;
      } finally {
        endTimer();
      }
    });
  }
}
