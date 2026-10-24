import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import type { Payment } from '@payment/prisma/generated/prisma/client';
import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';
import { PrismaService } from '@payment/prisma/prisma.service';

import { CorrelationIdService } from '@common/context';
import { CorrelationLogger } from '@common/logger';
import { MetricNames } from '@common/metrics';
import { OutboxRecord, toOutboxRecord } from '@messaging/outbox';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';
import {
  OrderCancelledPayload,
  OrderCreatedPayload,
} from '@contracts/order-events';
import {
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
} from '@contracts/payment-events';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { canTransition } from '../domain/payment-state-machine';
import {
  ChargeResult,
  PAYMENT_GATEWAY,
  PaymentGateway,
} from '../domain/ports/payment-gateway';
import { PaginatedPaymentsResponseDto } from '../dto/paginated-payments-response.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';
import { PaymentStatsResponseDto } from '../dto/payment-stats-response.dto';

const UNKNOWN_FAILURE_REASON = 'Unknown error';

/** The payment changed between read and conditional write; retry re-reads it */
export class ConcurrentPaymentUpdateError extends Error {
  constructor(paymentId: string) {
    super(`Payment ${paymentId} was updated concurrently`);
    this.name = ConcurrentPaymentUpdateError.name;
  }
}

@Injectable()
export class PaymentService {
  private readonly logger = new CorrelationLogger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: PaymentMetricsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  // ─────────────────────────────────────────────
  // QUERIES
  // ─────────────────────────────────────────────

  async findAll(
    page: number,
    limit: number,
  ): Promise<PaginatedPaymentsResponseDto> {
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.count(),
    ]);

    return {
      data: payments.map((payment) => this.toResponseDto(payment)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({ where: { id } });

    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }

    return this.toResponseDto(payment);
  }

  async findByOrderId(orderId: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment for order ${orderId} not found`);
    }

    return this.toResponseDto(payment);
  }

  async getStats(): Promise<PaymentStatsResponseDto> {
    const grouped = await this.prisma.payment.groupBy({
      by: ['status'],
      _count: { status: true },
      _sum: { amount: true },
    });

    return {
      byStatus: grouped.map((item) => ({
        status: item.status,
        count: item._count.status,
        totalAmount: item._sum.amount || 0,
      })),
    };
  }

  // ─────────────────────────────────────────────
  // EVENT HANDLERS
  // ─────────────────────────────────────────────

  /**
   * Idempotent on orderId:
   * - new payment → charge it
   * - existing PROCESSING payment (previous attempt crashed mid-way) → resume
   * - CANCELLED payment (tombstone: the order was cancelled first) → do
   *   nothing, the customer must not be charged
   * - already decided payment (redelivery) → do nothing: its result was
   *   written to the outbox in the same transaction as the decision
   */
  async handleOrderCreated(payload: OrderCreatedPayload) {
    this.logger.log(`💳 Processing payment for order ${payload.orderId}`);

    const { payment, created } = await this.findOrCreatePayment(payload);

    if (payment.status === PaymentStatus.CANCELLED) {
      this.logger.warn(
        `⚠️ Order ${payload.orderId} was cancelled before payment, not charging`,
      );
      // A payment created by OrderCreated (it has an amount; a tombstone does
      // not) may have been charged before the cancel won, with the refund
      // failing afterwards. This redelivery finishes it; refund is a no-op
      // when nothing was charged.
      if (payment.amount !== null) {
        await this.refundLostApproval(payment);
      }
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

    await this.processPayment(payment);
  }

  /**
   * Resumes a payment left in PROCESSING (its OrderCreated went to the DLQ,
   * or the service died mid-charge). Safe to race with a consumer: every
   * decision is a conditional update, so only one of them can win.
   */
  async resumePayment(payment: Payment) {
    this.logger.warn(
      `🔧 Resuming payment ${payment.id} stuck in PROCESSING for order ${payment.orderId}`,
    );
    await this.processPayment(payment);
  }

  /**
   * OrderCreated and OrderCancelled arrive on separate queues, so the cancel
   * may be handled first. Instead of waiting for the payment (a bounded retry
   * that, once exhausted, let the order be charged anyway), a CANCELLED
   * tombstone is written so a later OrderCreated finds it and never charges.
   */
  async handleOrderCancelled(payload: OrderCancelledPayload) {
    this.logger.log(`🚫 Cancelling payment for order ${payload.orderId}`);

    const payment = await this.prisma.payment.findUnique({
      where: { orderId: payload.orderId },
    });

    if (payment) {
      await this.cancelPaymentByStatus(payment);
      return;
    }

    const existing = await this.createCancelledTombstone(payload.orderId);

    if (existing) {
      // OrderCreated created the payment between the read and the write
      await this.cancelPaymentByStatus(existing);
    }
  }

  async saveFailedMessage(data: {
    queue: string;
    routingKey: string;
    payload: unknown;
    error?: string;
  }): Promise<void> {
    try {
      await this.prisma.failedMessage.create({
        data: {
          queue: data.queue,
          routingKey: data.routingKey,
          payload: data.payload as object,
          error: data.error,
        },
      });

      this.logger.log(
        `💾 Failed message saved — queue: ${data.queue} | routingKey: ${data.routingKey}`,
      );
    } catch (err) {
      this.logger.error(
        `❌ Could not save failed message to database — queue: ${data.queue} | routingKey: ${data.routingKey}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — PAYMENT PROCESSING
  // ─────────────────────────────────────────────

  private async findOrCreatePayment(
    payload: OrderCreatedPayload,
  ): Promise<{ payment: Payment; created: boolean }> {
    try {
      const payment = await this.prisma.payment.create({
        data: {
          orderId: payload.orderId,
          amount: payload.total,
          status: PaymentStatus.PROCESSING,
        },
      });
      return { payment, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        this.logger.error(
          `❌ Failed to create payment for order ${payload.orderId}`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }

      const payment = await this.prisma.payment.findUniqueOrThrow({
        where: { orderId: payload.orderId },
      });
      return { payment, created: false };
    }
  }

  /**
   * Returns null when the tombstone was written, or the payment that
   * OrderCreated created concurrently (unique orderId) when it lost the race.
   */
  private async createCancelledTombstone(
    orderId: string,
  ): Promise<Payment | null> {
    try {
      await this.prisma.payment.create({
        data: { orderId, status: PaymentStatus.CANCELLED },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      return this.prisma.payment.findUniqueOrThrow({ where: { orderId } });
    }

    this.metrics.incrementPaymentsCancelled();
    this.logger.log(
      `🪦 Payment for order ${orderId} recorded as CANCELLED before OrderCreated`,
    );
    return null;
  }

  private async processPayment(payment: Payment) {
    if (payment.amount === null) {
      // Only tombstones lack an amount, and they are CANCELLED, never charged
      throw new Error(`Payment ${payment.id} has no amount to charge`);
    }

    let result: ChargeResult;

    // Only gateway errors mark the payment as FAILED. A database error while
    // recording the decision propagates: nothing was committed (status and
    // outbox event are one transaction), so the retry resumes the payment
    // and charges again with the same paymentId, which the gateway dedupes.
    try {
      result = await this.gateway.charge(payment.id, payment.amount);
    } catch (error) {
      this.logger.error(
        `❌ Unexpected gateway error for order ${payment.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.failPayment(payment, error);
      return;
    }

    if (result.status === 'approved') {
      await this.approvePayment(payment);
    } else {
      await this.declinePayment(payment, result.reason);
    }
  }

  private async cancelPaymentByStatus(payment: Payment) {
    switch (payment.status) {
      case PaymentStatus.APPROVED:
        // Refund first: if marking REFUNDED fails, the retry refunds again
        // (idempotent on paymentId) instead of leaving the customer charged
        await this.gateway.refund(payment.id);
        await this.transitionOrThrow(payment, PaymentStatus.REFUNDED);
        this.metrics.incrementPaymentsRefunded();
        this.logger.log(
          `💰 Payment ${payment.id} marked as REFUNDED for order ${payment.orderId}`,
        );
        return;

      case PaymentStatus.PROCESSING:
        await this.transitionOrThrow(payment, PaymentStatus.CANCELLED);
        this.metrics.incrementPaymentsCancelled();
        this.logger.log(
          `✅ Payment ${payment.id} cancelled due to order cancellation`,
        );
        return;

      case PaymentStatus.DECLINED:
      case PaymentStatus.FAILED:
      case PaymentStatus.REFUNDED:
      case PaymentStatus.CANCELLED:
        this.logger.log(
          `ℹ️ Payment ${payment.id} already ${payment.status}, skipping`,
        );
        return;

      default:
        this.logger.warn(`⚠️ Unknown payment status ${String(payment.status)}`);
    }
  }

  private async refundLostApproval(payment: Payment) {
    if (await this.gateway.refund(payment.id)) {
      this.metrics.incrementPaymentsRefunded();
      this.logger.log(
        `💰 Charge of cancelled payment ${payment.id} refunded for order ${payment.orderId}`,
      );
    }
  }

  private async approvePayment(payment: Payment) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_APPROVAL_DURATION,
    );

    try {
      if (
        !(await this.transition(
          payment,
          PaymentStatus.APPROVED,
          {},
          this.approvedEvent(payment),
        ))
      ) {
        // The order was cancelled while the charge was in flight: the
        // customer was charged for a payment that is already CANCELLED.
        // A refund failure propagates, and the retry refunds again from
        // handleOrderCreated.
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while charging (order cancelled?), refunding the charge`,
        );
        await this.refundLostApproval(payment);
        return;
      }

      this.metrics.incrementPaymentsApproved();
      this.logger.log(`✅ Payment approved for order ${payment.orderId}`);
    } finally {
      endTimer();
    }
  }

  private async declinePayment(payment: Payment, failureReason: string) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_DECLINE_DURATION,
    );

    try {
      if (
        !(await this.transition(
          payment,
          PaymentStatus.DECLINED,
          { failureReason },
          this.declinedEvent(payment, failureReason),
        ))
      ) {
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while processing, not declining`,
        );
        return;
      }

      this.metrics.incrementPaymentsDeclined(failureReason);
      this.logger.warn(`⚠️ Payment declined for order ${payment.orderId}`);
    } finally {
      endTimer();
    }
  }

  private async failPayment(payment: Payment, error: unknown) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_FAILURE_DURATION,
    );
    const failureReason =
      error instanceof Error ? error.message : UNKNOWN_FAILURE_REASON;

    try {
      if (
        !(await this.transition(
          payment,
          PaymentStatus.FAILED,
          { failureReason },
          this.failedEvent(payment, failureReason),
        ))
      ) {
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

  // ─────────────────────────────────────────────
  // PRIVATE — OUTBOX EVENTS
  // ─────────────────────────────────────────────

  private approvedEvent(payment: Payment): OutboxRecord {
    return toOutboxRecord(
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_APPROVED,
      new PaymentApprovedEvent(
        { orderId: payment.orderId, transactionId: payment.id },
        CorrelationIdService.getId(),
      ),
    );
  }

  private declinedEvent(payment: Payment, reason: string): OutboxRecord {
    return toOutboxRecord(
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_DECLINED,
      new PaymentDeclinedEvent(
        { orderId: payment.orderId, reason },
        CorrelationIdService.getId(),
      ),
    );
  }

  private failedEvent(payment: Payment, error: string): OutboxRecord {
    return toOutboxRecord(
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_FAILED,
      new PaymentFailedEvent(
        { orderId: payment.orderId, error },
        CorrelationIdService.getId(),
      ),
    );
  }

  // ─────────────────────────────────────────────
  // PRIVATE — HELPERS
  // ─────────────────────────────────────────────

  /**
   * Atomic conditional update: succeeds only if the payment is still in the
   * status it was read with, so a concurrent cancel and approval cannot both
   * win. `data` is written in the same update (e.g. failureReason), so it is
   * never out of sync with the status, and `event` goes to the outbox in the
   * same transaction, only if this call performed the transition. Returns
   * whether it did.
   */
  private async transition(
    payment: Payment,
    to: PaymentStatus,
    data: Pick<Partial<Payment>, 'failureReason'> = {},
    event?: OutboxRecord,
  ): Promise<boolean> {
    if (!canTransition(payment.status, to)) {
      return false;
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: payment.status },
        data: { ...data, status: to },
      });

      if (count === 1 && event) {
        await tx.outboxMessage.create({ data: event });
      }

      return count === 1;
    });
  }

  private async transitionOrThrow(payment: Payment, to: PaymentStatus) {
    if (!(await this.transition(payment, to))) {
      throw new ConcurrentPaymentUpdateError(payment.id);
    }
  }

  private toResponseDto(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      status: payment.status,
      failureReason: payment.failureReason,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
