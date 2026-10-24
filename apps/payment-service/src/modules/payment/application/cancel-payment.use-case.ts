import { Inject, Injectable } from '@nestjs/common';

import { CorrelationLogger } from '@common/logger';
import { OrderCancelledPayload } from '@contracts/order-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { Payment } from '../domain/payment';
import { PaymentStatus } from '../domain/payment-status';
import {
  PAYMENT_REPOSITORY,
  PaymentRepository,
} from '../domain/ports/payment.repository';
import {
  PAYMENT_GATEWAY,
  PaymentGateway,
} from '../domain/ports/payment-gateway';

/** The payment changed between read and conditional save; retry re-reads it */
export class ConcurrentPaymentUpdateError extends Error {
  constructor(paymentId: string) {
    super(`Payment ${paymentId} was updated concurrently`);
    this.name = ConcurrentPaymentUpdateError.name;
  }
}

/** Compensates a cancelled order: cancel, refund, or block a future charge */
@Injectable()
export class CancelPaymentUseCase {
  private readonly logger = new CorrelationLogger(CancelPaymentUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly metrics: PaymentMetricsService,
  ) {}

  /**
   * OrderCreated and OrderCancelled arrive on separate queues, so the cancel
   * may be handled first. Instead of waiting for the payment (a bounded retry
   * that, once exhausted, let the order be charged anyway), a CANCELLED
   * tombstone is written so a later OrderCreated finds it and never charges.
   */
  async execute(payload: OrderCancelledPayload) {
    this.logger.log(`🚫 Cancelling payment for order ${payload.orderId}`);

    const payment = await this.payments.findByOrderId(payload.orderId);

    if (payment) {
      await this.cancel(payment);
      return;
    }

    if (await this.payments.createCancelledTombstone(payload.orderId)) {
      this.metrics.incrementPaymentsCancelled();
      this.logger.log(
        `🪦 Payment for order ${payload.orderId} recorded as CANCELLED before OrderCreated`,
      );
      return;
    }

    // OrderCreated created the payment between the read and the write
    const existing = await this.payments.findByOrderId(payload.orderId);

    if (!existing) {
      throw new Error(`Payment for order ${payload.orderId} not found`);
    }

    await this.cancel(existing);
  }

  private async cancel(payment: Payment) {
    switch (payment.status) {
      case PaymentStatus.APPROVED:
        // Refund first: if saving REFUNDED fails, the retry refunds again
        // (idempotent on paymentId) instead of leaving the customer charged
        await this.gateway.refund(payment.id);
        payment.refund();
        await this.saveOrThrow(payment);
        this.metrics.incrementPaymentsRefunded();
        this.logger.log(
          `💰 Payment ${payment.id} marked as REFUNDED for order ${payment.orderId}`,
        );
        return;

      case PaymentStatus.PROCESSING:
        payment.cancel();
        await this.saveOrThrow(payment);
        this.metrics.incrementPaymentsCancelled();
        this.logger.log(
          `✅ Payment ${payment.id} cancelled due to order cancellation`,
        );
        return;

      default:
        this.logger.log(
          `ℹ️ Payment ${payment.id} already ${payment.status}, skipping`,
        );
    }
  }

  private async saveOrThrow(payment: Payment) {
    if (!(await this.payments.save(payment))) {
      throw new ConcurrentPaymentUpdateError(payment.id);
    }
  }
}
