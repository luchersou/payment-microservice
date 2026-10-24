import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';
import { PrismaService } from '@payment/prisma/prisma.service';
import { randomUUID } from 'crypto';

import { correlationIdStorage } from '@common/context';
import { CorrelationLogger } from '@common/logger';

import { PaymentMetricsService } from '../../metrics/metrics.service';
import { PaymentService } from './payment.service';

const BATCH_SIZE = 50;

/**
 * A payment whose OrderCreated ended in the DLQ stays PROCESSING forever:
 * nothing else will ever touch it. Every RECONCILIATION_INTERVAL_MS this job
 * resumes the ones untouched for RECONCILIATION_STUCK_AFTER_MINUTES.
 */
@Injectable()
export class PaymentReconciliationService implements OnApplicationBootstrap {
  private readonly logger = new CorrelationLogger(
    PaymentReconciliationService.name,
  );
  private readonly intervalMs: number;
  private readonly stuckAfterMs: number;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentService: PaymentService,
    private readonly metrics: PaymentMetricsService,
    private readonly scheduler: SchedulerRegistry,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('RECONCILIATION_INTERVAL_MS', 60_000);
    this.stuckAfterMs =
      config.get<number>('RECONCILIATION_STUCK_AFTER_MINUTES', 5) * 60_000;
  }

  onApplicationBootstrap() {
    this.scheduler.addInterval(
      PaymentReconciliationService.name,
      setInterval(() => void this.reconcile(), this.intervalMs),
    );
  }

  /** Returns how many stuck payments were resumed */
  async reconcile(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      const stuck = await this.prisma.payment.findMany({
        where: {
          status: PaymentStatus.PROCESSING,
          updatedAt: { lt: new Date(Date.now() - this.stuckAfterMs) },
        },
        orderBy: { updatedAt: 'asc' },
        take: BATCH_SIZE,
      });

      let resumed = 0;

      for (const payment of stuck) {
        // A fresh correlationId ties together the logs of this resume
        await correlationIdStorage.run(
          { correlationId: `reconcile-${randomUUID()}` },
          async () => {
            try {
              await this.paymentService.resumePayment(payment);
              this.metrics.incrementPaymentsReconciled();
              resumed++;
            } catch (error) {
              this.logger.error(
                `❌ Could not resume payment ${payment.id}, retrying next run`,
                error instanceof Error ? error.stack : String(error),
              );
            }
          },
        );
      }

      return resumed;
    } catch (error) {
      this.logger.error(
        '❌ Payment reconciliation failed',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
