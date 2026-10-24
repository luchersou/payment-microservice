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
  OrderCancelledEvent,
  OrderCreatedEvent,
} from '@contracts/order-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { PrismaFailedMessageRepository } from '../infra/prisma-failed-message.repository';

@Injectable()
export class PaymentDlqConsumer {
  private readonly logger = new CorrelationLogger(PaymentDlqConsumer.name);

  constructor(
    private readonly failedMessages: PrismaFailedMessageRepository,
    private readonly metrics: PaymentMetricsService,
  ) {}

  // ========================
  // PAYMENT ORDER CREATED DLQ
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.PAYMENT_ORDER_CREATED,
    queue: DLQ.PAYMENT_ORDER_CREATED,
    queueOptions: DLQ_QUEUE_OPTIONS,
    errorHandler: createDelayedRequeueErrorHandler(),
  })
  async handleOrderCreatedDlq(
    event: OrderCreatedEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(`☠️ DLQ received — queue: ${DLQ.PAYMENT_ORDER_CREATED}`);

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.PAYMENT_ORDER_CREATED_DLQ_PROCESSING_DURATION,
      );

      try {
        this.metrics.incrementDlqMessages(
          DLQ.PAYMENT_ORDER_CREATED,
          amqpMsg.fields.routingKey,
        );

        await this.failedMessages.save({
          queue: DLQ.PAYMENT_ORDER_CREATED,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: getDeadLetterReason(amqpMsg),
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.PAYMENT_ORDER_CREATED}`,
        );
        throw error;
      } finally {
        endTimer();
      }
    });
  }

  // ========================
  // PAYMENT ORDER CANCELLED DLQ
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.DLX,
    routingKey: DLQ.PAYMENT_ORDER_CANCELLED,
    queue: DLQ.PAYMENT_ORDER_CANCELLED,
    queueOptions: DLQ_QUEUE_OPTIONS,
    errorHandler: createDelayedRequeueErrorHandler(),
  })
  async handleOrderCancelledDlq(
    event: OrderCancelledEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.warn(
        `☠️ DLQ received — queue: ${DLQ.PAYMENT_ORDER_CANCELLED}`,
      );

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.PAYMENT_ORDER_CANCELLED_DLQ_PROCESSING_DURATION,
      );

      try {
        this.metrics.incrementDlqMessages(
          DLQ.PAYMENT_ORDER_CANCELLED,
          amqpMsg.fields.routingKey,
        );

        await this.failedMessages.save({
          queue: DLQ.PAYMENT_ORDER_CANCELLED,
          routingKey: amqpMsg.fields.routingKey,
          payload: event,
          error: getDeadLetterReason(amqpMsg),
        });
      } catch (error) {
        this.logger.error(
          `❌ Failed to process DLQ message for ${DLQ.PAYMENT_ORDER_CANCELLED}`,
        );
        throw error;
      } finally {
        endTimer();
      }
    });
  }
}
