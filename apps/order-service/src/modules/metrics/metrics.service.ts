import { Injectable } from '@nestjs/common';

import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class OrderMetricsService {
  private readonly ordersCreatedTotal: Counter;
  private readonly ordersCancelledTotal: Counter;
  private readonly ordersCompletedTotal: Counter;
  private readonly ordersFailedTotal: Counter;
  private readonly dlqMessagesTotal: Counter;
  private readonly messageProcessingDuration: Histogram;

  constructor(private readonly registry: Registry) {
    this.ordersCreatedTotal = this.getOrCreateCounter({
      name: 'orders_created_total',
      help: 'Total number of orders created',
    });

    this.ordersCancelledTotal = this.getOrCreateCounter({
      name: 'orders_cancelled_total',
      help: 'Total number of orders cancelled',
      labelNames: ['reason'],
    });

    this.ordersCompletedTotal = this.getOrCreateCounter({
      name: 'orders_completed_total',
      help: 'Total number of orders completed (paid)',
    });

    this.ordersFailedTotal = this.getOrCreateCounter({
      name: 'orders_failed_total',
      help: 'Total number of orders failed',
    });

    this.dlqMessagesTotal = this.getOrCreateCounter({
      name: 'order_dlq_messages_total',
      help: 'Total number of messages sent to DLQ',
      labelNames: ['queue', 'routing_key'],
    });

    this.messageProcessingDuration =
      (this.registry.getSingleMetric(
        'order_message_processing_duration_seconds',
      ) as Histogram) ??
      new Histogram({
        name: 'order_message_processing_duration_seconds',
        help: 'Duration of RabbitMQ message processing in seconds',
        labelNames: ['event_type'],
        buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
        registers: [this.registry],
      });
  }

  incrementOrdersCreated() {
    this.ordersCreatedTotal.inc();
  }

  incrementOrdersCancelled(reason: string) {
    this.ordersCancelledTotal.inc({ reason });
  }

  incrementOrdersCompleted() {
    this.ordersCompletedTotal.inc();
  }

  incrementOrdersFailed() {
    this.ordersFailedTotal.inc();
  }

  incrementDlqMessages(queue: string, routingKey: string) {
    this.dlqMessagesTotal.inc({ queue, routing_key: routingKey });
  }

  startMessageProcessingTimer(eventType: string): () => void {
    return this.messageProcessingDuration.startTimer({ event_type: eventType });
  }

  private getOrCreateCounter(config: {
    name: string;
    help: string;
    labelNames?: string[];
  }): Counter {
    return (
      (this.registry.getSingleMetric(config.name) as Counter) ??
      new Counter({ ...config, registers: [this.registry] })
    );
  }
}
