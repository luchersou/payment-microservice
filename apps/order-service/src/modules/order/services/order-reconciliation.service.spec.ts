import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { OrderStatus } from '@order/prisma/generated/prisma/enums';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderReconciliationService } from './order-reconciliation.service';

jest.mock('@order/prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('OrderReconciliationService', () => {
  let prisma: { order: { count: jest.Mock; findMany: jest.Mock } };
  let metrics: { setOrdersStuckPendingPayment: jest.Mock };
  let service: OrderReconciliationService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-01-01T12:00:00Z'));
    prisma = {
      order: {
        count: jest.fn().mockResolvedValue(2),
        findMany: jest.fn().mockResolvedValue([{ id: 'o-1' }, { id: 'o-2' }]),
      },
    };
    metrics = { setOrdersStuckPendingPayment: jest.fn() };
    service = new OrderReconciliationService(
      prisma as never,
      metrics as unknown as OrderMetricsService,
      {} as SchedulerRegistry,
      new ConfigService({ RECONCILIATION_STUCK_AFTER_MINUTES: 10 }),
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('counts PENDING_PAYMENT orders untouched for longer than the threshold', async () => {
    await expect(service.reconcile()).resolves.toBe(2);

    expect(prisma.order.count).toHaveBeenCalledWith({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        updatedAt: { lt: new Date('2026-01-01T11:50:00Z') },
      },
    });
    expect(metrics.setOrdersStuckPendingPayment).toHaveBeenCalledWith(2);
  });

  it('resets the gauge to zero once nothing is stuck', async () => {
    prisma.order.count.mockResolvedValue(0);
    prisma.order.findMany.mockResolvedValue([]);

    await service.reconcile();

    expect(metrics.setOrdersStuckPendingPayment).toHaveBeenCalledWith(0);
  });

  it('does not throw when the query fails', async () => {
    prisma.order.count.mockRejectedValue(new Error('db down'));

    await expect(service.reconcile()).resolves.toBe(0);
    expect(metrics.setOrdersStuckPendingPayment).not.toHaveBeenCalled();
  });
});
