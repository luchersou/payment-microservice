import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { PrismaService } from '@order/prisma/prisma.service';

import { CorrelationLogger } from '@common/logger';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderStatus } from '../domain/order-status';

const LOGGED_IDS = 20;

/**
 * An order whose payment result never arrives (e.g. it went to a DLQ) stays
 * PENDING_PAYMENT forever. The order service cannot decide the payment, so
 * this job only makes those orders visible: every RECONCILIATION_INTERVAL_MS
 * it logs the ones untouched for RECONCILIATION_STUCK_AFTER_MINUTES and
 * exposes how many there are (orders_stuck_pending_payment).
 */
@Injectable()
export class OrderReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new CorrelationLogger(
    OrderReconciliationService.name,
  );
  private readonly intervalMs: number;
  private readonly stuckAfterMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: OrderMetricsService,
    private readonly scheduler: SchedulerRegistry,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('RECONCILIATION_INTERVAL_MS', 60_000);
    this.stuckAfterMs =
      config.get<number>('RECONCILIATION_STUCK_AFTER_MINUTES', 5) * 60_000;
  }

  onApplicationBootstrap() {
    this.scheduler.addInterval(
      OrderReconciliationService.name,
      setInterval(() => void this.reconcile(), this.intervalMs),
    );
  }

  /** Returns how many orders are stuck */
  async reconcile(): Promise<number> {
    try {
      const where = {
        status: OrderStatus.PENDING_PAYMENT,
        updatedAt: { lt: new Date(Date.now() - this.stuckAfterMs) },
      };

      const [count, oldest] = await Promise.all([
        this.prisma.order.count({ where }),
        this.prisma.order.findMany({
          where,
          select: { id: true },
          orderBy: { updatedAt: 'asc' },
          take: LOGGED_IDS,
        }),
      ]);

      this.metrics.setOrdersStuckPendingPayment(count);

      if (count > 0) {
        this.logger.warn(
          `🧭 ${count} order(s) stuck in PENDING_PAYMENT, oldest: ${oldest.map((o) => o.id).join(', ')}`,
        );
      }

      return count;
    } catch (error) {
      this.logger.error(
        '❌ Order reconciliation failed',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }
}
