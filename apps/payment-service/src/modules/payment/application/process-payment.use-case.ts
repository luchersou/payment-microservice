import { Inject, Injectable } from '@nestjs/common';

import { CorrelationLogger } from '@common/logger';
import { MetricNames } from '@common/metrics';
import { OrderCreatedPayload } from '@contracts/order-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { Payment } from '../domain/payment';
import { PaymentStatus } from '../domain/payment-status';
import {
  PAYMENT_REPOSITORY,
  PaymentRepository,
} from '../domain/ports/payment.repository';
import {
  ChargeResult,
  PAYMENT_GATEWAY,
  PaymentGateway,
} from '../domain/ports/payment-gateway';

const UNKNOWN_FAILURE_REASON = 'Unknown error';

/** Charges the payment for an order (OrderCreated) or resumes a stuck one */
@Injectable()
export class ProcessPaymentUseCase {
  private readonly logger = new CorrelationLogger(ProcessPaymentUseCase.name);

  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    private readonly metrics: PaymentMetricsService,
  ) {}

  /**
   * Idempotent on orderId:
   * - new payment → charge it
   * - existing PROCESSING payment (previous attempt crashed mid-way) → resume
   * - CANCELLED payment (the order was cancelled first) → never charge
   * - APPROVED payment (redelivery) → make sure it is captured, nothing else
   * - otherwise decided payment (redelivery) → do nothing: its result was
   *   written to the outbox in the same transaction as the decision
   */
  async execute(payload: OrderCreatedPayload) {
    this.logger.log(`💳 Processing payment for order ${payload.orderId}`);

    const created = await this.payments.createProcessing(
      payload.orderId,
      payload.totalCents,
    );
    const payment =
      created ?? (await this.payments.findByOrderId(payload.orderId));

    if (!payment) {
      throw new Error(`Payment for order ${payload.orderId} not found`);
    }

    if (payment.status === PaymentStatus.CANCELLED) {
      this.logger.warn(
        `⚠️ Order ${payload.orderId} was cancelled before payment, not charging`,
      );
      // An authorization may have been taken before the cancel won, with
      // the release failing afterwards. This redelivery finishes it; release
      // is a no-op when nothing is held.
      if (payment.mayHaveBeenCharged) {
        await this.releaseLostAuthorization(payment);
      }
      return;
    }

    if (payment.status === PaymentStatus.APPROVED) {
      // Finishes a capture that failed after the approval was saved
      await this.gateway.capture(payment.id);
      this.logger.warn(
        `⚠️ Payment for order ${payload.orderId} already APPROVED, capture ensured`,
      );
      return;
    }

    if (payment.status !== PaymentStatus.PROCESSING) {
      this.logger.warn(
        `⚠️ Payment for order ${payload.orderId} already ${payment.status}, skipping`,
      );
      return;
    }

    if (!created) {
      this.logger.warn(
        `⚠️ Resuming payment ${payment.id} stuck in PROCESSING for order ${payload.orderId}`,
      );
    }

    await this.charge(payment);
  }

  /**
   * Resumes a payment left in PROCESSING (its OrderCreated went to the DLQ,
   * or the service died mid-charge). Safe to race with a consumer: every
   * decision is a conditional save, so only one of them can win.
   */
  async resume(payment: Payment) {
    this.logger.warn(
      `🔧 Resuming payment ${payment.id} stuck in PROCESSING for order ${payment.orderId}`,
    );
    await this.charge(payment);
  }

  private async charge(payment: Payment) {
    if (payment.amountCents === null) {
      // Only tombstones lack an amount, and they are CANCELLED, never charged
      throw new Error(`Payment ${payment.id} has no amountCents to charge`);
    }

    let result: ChargeResult;

    // Only gateway errors mark the payment as FAILED. A database error while
    // recording the decision propagates: nothing was committed (status and
    // outbox event are one transaction), so the retry resumes the payment
    // and authorizes again with the same paymentId, which the gateway dedupes.
    try {
      result = await this.gateway.authorize(payment.id, payment.amountCents);
    } catch (error) {
      this.logger.error(
        `❌ Unexpected gateway error for order ${payment.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.fail(payment, error);
      return;
    }

    if (result.status === 'approved') {
      await this.approve(payment);
    } else {
      await this.decline(payment, result.reason);
    }
  }

  private async approve(payment: Payment) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_APPROVAL_DURATION,
    );

    try {
      payment.approve();

      if (!(await this.payments.save(payment))) {
        // The order was cancelled while the authorization was in flight.
        // Nothing was captured yet, so voiding it means the customer is
        // never charged. A release failure propagates, and the retry
        // releases again from execute().
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while authorizing (order cancelled?), releasing the authorization`,
        );
        await this.releaseLostAuthorization(payment);
        return;
      }

      this.metrics.incrementPaymentsApproved();
      this.logger.log(`✅ Payment approved for order ${payment.orderId}`);

      // Only now that the approval is recorded is the money taken. A capture
      // failure propagates; the redelivery finds APPROVED and captures again.
      await this.gateway.capture(payment.id);
    } finally {
      endTimer();
    }
  }

  private async decline(payment: Payment, reason: string) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_DECLINE_DURATION,
    );

    try {
      payment.decline(reason);

      if (!(await this.payments.save(payment))) {
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while processing, not declining`,
        );
        return;
      }

      this.metrics.incrementPaymentsDeclined(reason);
      this.logger.warn(`⚠️ Payment declined for order ${payment.orderId}`);
    } finally {
      endTimer();
    }
  }

  private async fail(payment: Payment, error: unknown) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_FAILURE_DURATION,
    );

    try {
      payment.fail(
        error instanceof Error ? error.message : UNKNOWN_FAILURE_REASON,
      );

      if (!(await this.payments.save(payment))) {
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while processing, not failing`,
        );
        return;
      }

      this.metrics.incrementPaymentsFailed();
      this.logger.error(`❌ Payment failed for order ${payment.orderId}`);
    } finally {
      endTimer();
    }
  }

  private async releaseLostAuthorization(payment: Payment) {
    const released = await this.gateway.release(payment.id);

    if (released === 'voided') {
      this.metrics.incrementAuthorizationsVoided();
      this.logger.log(
        `🔓 Authorization of cancelled payment ${payment.id} voided, order ${payment.orderId} not charged`,
      );
      return;
    }

    if (released !== 'refunded') return;

    // Only if a capture slipped through (it should not: capture happens
    // after the approval wins). Money moved back, so announce it, from a
    // fresh read since `payment` may still hold the lost approval.
    this.metrics.incrementPaymentsRefunded();
    this.logger.log(
      `💰 Charge of cancelled payment ${payment.id} refunded for order ${payment.orderId}`,
    );

    const cancelled = await this.payments.findByOrderId(payment.orderId);

    if (cancelled?.status === PaymentStatus.CANCELLED) {
      cancelled.recordRefundOfLostCharge();
      await this.payments.save(cancelled);
    }
  }
}
