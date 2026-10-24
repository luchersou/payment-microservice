import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderStatus } from '../domain/order-status';
import { ApplyPaymentResultUseCase } from './apply-payment-result.use-case';
import { ConcurrentOrderUpdateError } from './concurrent-order-update.error';
import { InMemoryOrderRepository } from './testing/in-memory-order.repository';
import { makeMetrics } from './testing/test-doubles';

describe('ApplyPaymentResultUseCase', () => {
  let orders: InMemoryOrderRepository;
  let metrics: ReturnType<typeof makeMetrics>;
  let useCase: ApplyPaymentResultUseCase;

  beforeEach(() => {
    orders = new InMemoryOrderRepository();
    metrics = makeMetrics();
    useCase = new ApplyPaymentResultUseCase(
      orders,
      metrics as unknown as OrderMetricsService,
    );
  });

  describe('approved', () => {
    it('moves PENDING_PAYMENT to PAID', async () => {
      orders.seed('o', OrderStatus.PENDING_PAYMENT);

      await useCase.execute('o', 'approved');

      expect(orders.stored('o')?.status).toBe(OrderStatus.PAID);
      expect(metrics.incrementOrdersCompleted).toHaveBeenCalledTimes(1);
    });

    it.each([OrderStatus.CANCELLED, OrderStatus.FAILED, OrderStatus.PAID])(
      'leaves a %s order untouched',
      async (status) => {
        orders.seed('o', status);

        await useCase.execute('o', 'approved');

        expect(orders.stored('o')?.status).toBe(status);
        expect(metrics.incrementOrdersCompleted).not.toHaveBeenCalled();
      },
    );
  });

  describe.each(['declined', 'failed'] as const)('%s', (outcome) => {
    it('fails a PENDING_PAYMENT order without announcing anything', async () => {
      orders.seed('o', OrderStatus.PENDING_PAYMENT);

      await useCase.execute('o', outcome);

      expect(orders.stored('o')?.status).toBe(OrderStatus.FAILED);
      expect(orders.events).toHaveLength(0);
      expect(metrics.incrementOrdersFailed).toHaveBeenCalledTimes(1);
      expect(metrics.incrementOrdersCancelled).not.toHaveBeenCalled();
    });

    it.each([OrderStatus.PAID, OrderStatus.CANCELLED])(
      'does not overwrite a %s order',
      async (status) => {
        orders.seed('o', status);

        await useCase.execute('o', outcome);

        expect(orders.stored('o')?.status).toBe(status);
      },
    );
  });

  it('ignores an unknown order', async () => {
    await expect(useCase.execute('missing', 'approved')).resolves.toBe(
      undefined,
    );
    expect(orders.size).toBe(0);
  });

  it('throws a retryable error when the order changed concurrently', async () => {
    orders.seed('o', OrderStatus.PENDING_PAYMENT);
    jest.spyOn(orders, 'save').mockResolvedValueOnce(false);

    await expect(useCase.execute('o', 'approved')).rejects.toBeInstanceOf(
      ConcurrentOrderUpdateError,
    );
  });
});
