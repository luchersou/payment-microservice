import { Injectable, NotFoundException } from '@nestjs/common';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import type { Payment } from '@payment/prisma/generated/prisma/client';
import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';
import { PrismaService } from '@payment/prisma/prisma.service';

import { CorrelationIdService } from '@common/context';
import { CorrelationLogger } from '@common/logger';
import { MetricNames } from '@common/metrics';
import { Exchanges, publishEvent, RoutingKeys } from '@messaging/rabbitmq';
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
import { PaginatedPaymentsResponseDto } from '../dto/paginated-payments-response.dto';
import { PaymentResponseDto } from '../dto/payment-response.dto';
import { PaymentStatsResponseDto } from '../dto/payment-stats-response.dto';

const DEFAULT_DECLINE_REASON = 'Insufficient funds';
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
    private readonly amqpConnection: AmqpConnection,
    private readonly metrics: PaymentMetricsService,
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
   * - already decided payment (previous attempt failed to publish) →
   *   republish its result; the order service handles results idempotently
   */
  async handleOrderCreated(payload: OrderCreatedPayload) {
    this.logger.log(`💳 Processing payment for order ${payload.orderId}`);

    const { payment, created } = await this.findOrCreatePayment(payload);

    if (payment.status === PaymentStatus.CANCELLED) {
      this.logger.warn(
        `⚠️ Order ${payload.orderId} was cancelled before payment, not charging`,
      );
      return;
    }

    if (payment.status !== PaymentStatus.PROCESSING) {
      this.logger.warn(
        `⚠️ Payment for order ${payload.orderId} already ${payment.status}, republishing result`,
      );
      await this.publishResult(payment);
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
    let result: { approved: boolean; reason?: string };

    // Only gateway errors mark the payment as FAILED. Errors after the
    // decision (DB, broker) propagate so the message is retried and the
    // decided result is republished.
    try {
      result = await this.simulatePaymentGateway();
    } catch (error) {
      this.logger.error(
        `❌ Unexpected gateway error for order ${payment.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.failPayment(payment, error);
      return;
    }

    if (result.approved) {
      await this.approvePayment(payment);
    } else {
      await this.declinePayment(payment, result.reason);
    }
  }

  private async cancelPaymentByStatus(payment: Payment) {
    switch (payment.status) {
      case PaymentStatus.APPROVED:
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

  private async approvePayment(payment: Payment) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_APPROVAL_DURATION,
    );

    try {
      if (!(await this.transition(payment, PaymentStatus.APPROVED))) {
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while processing (order cancelled?), not approving`,
        );
        return;
      }

      this.metrics.incrementPaymentsApproved();
      this.logger.log(`✅ Payment approved for order ${payment.orderId}`);

      await this.publishApproved(payment);
    } finally {
      endTimer();
    }
  }

  private async declinePayment(payment: Payment, reason?: string) {
    const endTimer = this.metrics.startMessageProcessingTimer(
      MetricNames.PAYMENT_DECLINE_DURATION,
    );
    const failureReason = reason ?? DEFAULT_DECLINE_REASON;

    try {
      if (
        !(await this.transition(payment, PaymentStatus.DECLINED, {
          failureReason,
        }))
      ) {
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while processing, not declining`,
        );
        return;
      }

      this.metrics.incrementPaymentsDeclined(reason ?? 'insufficient_funds');
      this.logger.warn(`⚠️ Payment declined for order ${payment.orderId}`);

      await this.publishDeclined({ ...payment, failureReason });
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
        !(await this.transition(payment, PaymentStatus.FAILED, {
          failureReason,
        }))
      ) {
        this.logger.warn(
          `⚠️ Payment ${payment.id} changed while processing, not failing`,
        );
        return;
      }

      this.metrics.incrementPaymentsFailed();
      this.logger.error(`❌ Payment failed for order ${payment.orderId}`);

      await this.publishFailed({ ...payment, failureReason });
    } finally {
      endTimer();
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE — PUBLISHING
  // ─────────────────────────────────────────────

  private async publishResult(payment: Payment) {
    switch (payment.status) {
      case PaymentStatus.APPROVED:
        return this.publishApproved(payment);
      case PaymentStatus.DECLINED:
        return this.publishDeclined(payment);
      case PaymentStatus.FAILED:
        return this.publishFailed(payment);
      default:
        // REFUNDED / CANCELLED: the order was cancelled, nothing to report
        return;
    }
  }

  private async publishApproved(payment: Payment) {
    const correlationId = CorrelationIdService.getId();

    await publishEvent(
      this.amqpConnection,
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_APPROVED,
      new PaymentApprovedEvent(
        { orderId: payment.orderId, transactionId: payment.id },
        correlationId,
      ),
    );
  }

  // The reason is read from the record so a republished result (redelivery)
  // carries the original one. The fallbacks only cover payments decided
  // before failureReason was persisted.

  private async publishDeclined(payment: Payment) {
    const correlationId = CorrelationIdService.getId();

    await publishEvent(
      this.amqpConnection,
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_DECLINED,
      new PaymentDeclinedEvent(
        {
          orderId: payment.orderId,
          reason: payment.failureReason ?? DEFAULT_DECLINE_REASON,
        },
        correlationId,
      ),
    );
  }

  private async publishFailed(payment: Payment) {
    const correlationId = CorrelationIdService.getId();

    await publishEvent(
      this.amqpConnection,
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_FAILED,
      new PaymentFailedEvent(
        {
          orderId: payment.orderId,
          error: payment.failureReason ?? UNKNOWN_FAILURE_REASON,
        },
        correlationId,
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
   * never out of sync with the status. Returns whether this call performed
   * the transition.
   */
  private async transition(
    payment: Payment,
    to: PaymentStatus,
    data: Pick<Partial<Payment>, 'failureReason'> = {},
  ): Promise<boolean> {
    if (!canTransition(payment.status, to)) {
      return false;
    }

    const { count } = await this.prisma.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: { ...data, status: to },
    });

    return count === 1;
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

  /**
   * A real gateway integration must send payment.id as the idempotency
   * key: a resumed PROCESSING payment may be charged again otherwise.
   */
  private async simulatePaymentGateway(): Promise<{
    approved: boolean;
    reason?: string;
  }> {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    /**
     * 20% of the time, the payment is declined due to insufficient funds
     */
    if (Math.random() < 0.2) {
      return { approved: false, reason: DEFAULT_DECLINE_REASON };
    }

    return { approved: true };
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
