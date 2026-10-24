import { Inject, Injectable } from '@nestjs/common';

import { CorrelationLogger } from '@common/logger';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { Order } from '../domain/order';
import { OrderStatus } from '../domain/order-status';
import {
  ORDER_REPOSITORY,
  OrderRepository,
} from '../domain/ports/order.repository';
import { ConcurrentOrderUpdateError } from './concurrent-order-update.error';

export type PaymentOutcome = 'approved' | 'declined' | 'failed';

/**
 * Moves the order to PAID (approved) or FAILED (declined or failed). Neither
 * publishes anything: the payment is already final, so there is nothing for
 * the payment service to compensate.
 */
@Injectable()
export class ApplyPaymentResultUseCase {
  private readonly logger = new CorrelationLogger(
    ApplyPaymentResultUseCase.name,
  );

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly metrics: OrderMetricsService,
  ) {}

  async execute(orderId: string, outcome: PaymentOutcome) {
    const target =
      outcome === 'approved' ? OrderStatus.PAID : OrderStatus.FAILED;
    const order = await this.orders.findById(orderId);

    if (!order) {
      this.logger.warn(
        `⚠️ Order ${orderId} not found. Ignoring payment ${outcome}.`,
      );
      return;
    }

    if (order.status === target) {
      this.logger.log(`ℹ️ Order ${orderId} already ${target}. Skipping.`);
      return;
    }

    // e.g. the order was cancelled before the payment result arrived
    if (!order.canMoveTo(target)) {
      this.logger.warn(
        `⚠️ Cannot move order ${orderId} from ${order.status} to ${target}`,
      );
      return;
    }

    this.apply(order, target);

    if (!(await this.orders.save(order))) {
      throw new ConcurrentOrderUpdateError(orderId);
    }

    if (target === OrderStatus.PAID) {
      this.logger.log(`✅ Order ${orderId} marked as PAID`);
      this.metrics.incrementOrdersCompleted();
    } else {
      this.logger.warn(`⚠️ Order ${orderId} marked as FAILED`);
      this.metrics.incrementOrdersFailed();
    }
  }

  private apply(order: Order, target: OrderStatus) {
    if (target === OrderStatus.PAID) {
      order.markPaid();
    } else {
      order.fail();
    }
  }
}
