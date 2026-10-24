import { Inject, Injectable } from '@nestjs/common';

import { CorrelationLogger } from '@common/logger';
import { CancelReason } from '@contracts/order-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { Order } from '../domain/order';
import { OrderStatus } from '../domain/order-status';
import {
  ORDER_REPOSITORY,
  OrderRepository,
} from '../domain/ports/order.repository';
import { ConcurrentOrderUpdateError } from './concurrent-order-update.error';

/**
 * User cancel, the only source of OrderCancelled: payment results never
 * cancel an order, a declined or failed payment fails it.
 */
@Injectable()
export class CancelOrderUseCase {
  private readonly logger = new CorrelationLogger(CancelOrderUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly metrics: OrderMetricsService,
  ) {}

  async execute(orderId: string) {
    this.logger.warn(`⚠️ Attempting to cancel order ${orderId}`);

    const order = await this.orders.findById(orderId);

    if (order) {
      await this.cancel(order);
      return;
    }

    // Cancel handled before the create request: take the id with a
    // CANCELLED tombstone instead of waiting for the order (a bounded retry
    // that, once exhausted, let it be created and charged)
    if (await this.orders.create(Order.cancelledTombstone(orderId))) {
      this.logger.log(
        `🪦 Order ${orderId} recorded as CANCELLED before being created`,
      );
      this.metrics.incrementOrdersCancelled(CancelReason.USER_REQUESTED);
      return;
    }

    // The create request persisted the order between the read and the insert
    const created = await this.orders.findById(orderId);

    if (!created) {
      throw new Error(`Order ${orderId} not found`);
    }

    await this.cancel(created);
  }

  private async cancel(order: Order) {
    if (order.status === OrderStatus.CANCELLED) {
      this.logger.log(`ℹ️ Order ${order.id} already CANCELLED. Skipping.`);
      return;
    }

    if (!order.canMoveTo(OrderStatus.CANCELLED)) {
      this.logger.warn(
        `⚠️ Cannot cancel order ${order.id} with status ${order.status}. Skipping.`,
      );
      return;
    }

    order.cancel();

    if (!(await this.orders.save(order))) {
      throw new ConcurrentOrderUpdateError(order.id);
    }

    this.logger.log(`✅ Order ${order.id} updated to CANCELLED successfully`);
    this.metrics.incrementOrdersCancelled(CancelReason.USER_REQUESTED);
  }
}
