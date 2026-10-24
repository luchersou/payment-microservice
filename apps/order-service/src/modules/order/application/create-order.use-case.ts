import { Inject, Injectable } from '@nestjs/common';

import { randomUUID } from 'crypto';

import { CorrelationLogger } from '@common/logger';
import { CreateOrderRequestedPayload } from '@contracts/order-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { Order } from '../domain/order';
import {
  ORDER_REPOSITORY,
  OrderRepository,
} from '../domain/ports/order.repository';

@Injectable()
export class CreateOrderUseCase {
  private readonly logger = new CorrelationLogger(CreateOrderUseCase.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly metrics: OrderMetricsService,
  ) {}

  /**
   * Idempotent on payload.orderId: a redelivered request finds the existing
   * order and does nothing. OrderCreated is written to the outbox in the same
   * transaction as the order, so there is never anything to republish.
   *
   * If the order was cancelled before this request was handled, a CANCELLED
   * tombstone already holds the id, so OrderCreated is never written.
   */
  async execute(payload: CreateOrderRequestedPayload) {
    // Fallback for requests published before the gateway sent orderId
    const orderId = payload.orderId ?? randomUUID();
    const order = Order.create(orderId, payload.userId, payload.total);

    if (await this.orders.create(order)) {
      this.logger.log(`✅ Order ${orderId} persisted`);
      this.metrics.incrementOrdersCreated();
      return;
    }

    const existing = await this.orders.findById(orderId);
    this.logger.warn(
      `⚠️ Order ${orderId} already exists as ${existing?.status}, nothing to do`,
    );
  }
}
