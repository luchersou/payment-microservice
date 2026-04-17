import { Injectable } from '@nestjs/common';

import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { ConsumeMessage } from 'amqplib';

import { CorrelationLogger } from '@common/logger';
import { runWithCorrelation } from '@common/messaging';
import {
  Exchanges,
  PAYMENT_ORDER_CANCELLED_QUEUE_OPTIONS,
  PAYMENT_ORDER_CREATED_QUEUE_OPTIONS,
  Queues,
  RoutingKeys,
} from '@messaging/rabbitmq';
import { OrderCancelledEvent, OrderCreatedEvent } from '@contracts/events';
import { MetricNames } from '@contracts/types';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { PaymentService } from '../services/payment.service';

@Injectable()
export class PaymentConsumer {
  private readonly logger = new CorrelationLogger(PaymentConsumer.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly metrics: PaymentMetricsService,
  ) {}

  // ========================
  // ORDER CREATED
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CREATED,
    queue: Queues.PAYMENT_ORDER_CREATED,
    queueOptions: PAYMENT_ORDER_CREATED_QUEUE_OPTIONS,
  })
  async handleOrderCreated(event: OrderCreatedEvent, amqpMsg: ConsumeMessage) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.log(`📥 Received OrderCreated: ${event.payload.orderId}`);

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.PAYMENT_ORDER_CREATED_PROCESSING_DURATION,
      );

      try {
        await this.paymentService.handleOrderCreated(event.payload);
      } catch (error) {
        this.logger.error(
          `❌ Error processing OrderCreated for order ${event.payload.orderId}`,
        );
        throw error;
      } finally {
        endTimer();
      }
    });
  }

  // ========================
  // ORDER CANCELLED
  // ========================

  @RabbitSubscribe({
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CANCELLED,
    queue: Queues.PAYMENT_ORDER_CANCELLED,
    queueOptions: PAYMENT_ORDER_CANCELLED_QUEUE_OPTIONS,
  })
  async handleOrderCancelled(
    event: OrderCancelledEvent,
    amqpMsg: ConsumeMessage,
  ) {
    await runWithCorrelation(amqpMsg, async () => {
      this.logger.log(`📥 Received OrderCancelled: ${event.payload.orderId}`);

      const endTimer = this.metrics.startMessageProcessingTimer(
        MetricNames.PAYMENT_ORDER_CANCELLED_PROCESSING_DURATION,
      );

      try {
        await this.paymentService.handleOrderCancelled(event.payload);
      } catch (error) {
        this.logger.error(
          `❌ Error processing OrderCancelled for order ${event.payload.orderId}`,
        );
        throw error;
      } finally {
        endTimer();
      }
    });
  }
}
