import { Injectable } from '@nestjs/common';

import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class PaymentMetricsService {
  private readonly paymentsApprovedTotal: Counter;
  private readonly paymentsDeclinedTotal: Counter;
  private readonly paymentsFailedTotal: Counter;
  private readonly dlqMessagesTotal: Counter;
  private readonly messageProcessingDuration: Histogram;

  constructor(private readonly registry: Registry) {
    this.paymentsApprovedTotal = this.getOrCreateCounter({
      name: 'payments_approved_total',
      help: 'Total number of payments approved',
    });

    this.paymentsDeclinedTotal = this.getOrCreateCounter({
      name: 'payments_declined_total',
      help: 'Total number of payments declined',
      labelNames: ['reason'],
    });

    this.paymentsFailedTotal = this.getOrCreateCounter({
      name: 'payments_failed_total',
      help: 'Total number of payments failed (technical error)',
    });

    this.dlqMessagesTotal = this.getOrCreateCounter({
      name: 'payment_dlq_messages_total',
      help: 'Total number of messages sent to DLQ in payment service',
      labelNames: ['queue', 'routing_key'],
    });

    this.messageProcessingDuration =
      (this.registry.getSingleMetric(
        'payment_message_processing_duration_seconds',
      ) as Histogram) ??
      new Histogram({
        name: 'payment_message_processing_duration_seconds',
        help: 'Duration of RabbitMQ message processing in seconds',
        labelNames: ['event_type'],
        buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
        registers: [this.registry],
      });
  }

  incrementPaymentsApproved() {
    this.paymentsApprovedTotal.inc();
  }

  incrementPaymentsDeclined(reason: string) {
    this.paymentsDeclinedTotal.inc({ reason });
  }

  incrementPaymentsFailed() {
    this.paymentsFailedTotal.inc();
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
