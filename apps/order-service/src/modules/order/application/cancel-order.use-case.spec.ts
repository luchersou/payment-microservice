import { CancelReason } from '@contracts/order-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderStatus } from '../domain/order-status';
import { CancelOrderUseCase } from './cancel-order.use-case';
import { ConcurrentOrderUpdateError } from './concurrent-order-update.error';
import { CreateOrderUseCase } from './create-order.use-case';
import { InMemoryOrderRepository } from './testing/in-memory-order.repository';
import { makeMetrics } from './testing/test-doubles';

describe('CancelOrderUseCase', () => {
  let orders: InMemoryOrderRepository;
  let metrics: ReturnType<typeof makeMetrics>;
  let useCase: CancelOrderUseCase;

  const eventTypes = () => orders.events.map((e) => e.type);

  beforeEach(() => {
    orders = new InMemoryOrderRepository();
    metrics = makeMetrics();
    useCase = new CancelOrderUseCase(
      orders,
      metrics as unknown as OrderMetricsService,
    );
  });

  it.each([OrderStatus.PENDING_PAYMENT, OrderStatus.PAID])(
    'cancels a %s order and records OrderCancelled',
    async (status) => {
      orders.seed('o', status);

      await useCase.execute('o');

      expect(orders.stored('o')?.status).toBe(OrderStatus.CANCELLED);
      expect(orders.events).toEqual([
        { type: 'OrderCancelled', orderId: 'o', cancelledAt: expect.any(Date) },
      ]);
      expect(metrics.incrementOrdersCancelled).toHaveBeenCalledWith(
        CancelReason.USER_REQUESTED,
      );
    },
  );

  it('records a CANCELLED tombstone when the order does not exist yet', async () => {
    await useCase.execute('missing');

    expect(orders.stored('missing')).toEqual({
      id: 'missing',
      userId: null,
      totalCents: null,
      status: OrderStatus.CANCELLED,
    });
    expect(eventTypes()).toEqual(['OrderCancelled']);
    expect(metrics.incrementOrdersCancelled).toHaveBeenCalledWith(
      CancelReason.USER_REQUESTED,
    );
  });

  it('a create request handled after the tombstone never writes OrderCreated', async () => {
    const createOrder = new CreateOrderUseCase(
      orders,
      metrics as unknown as OrderMetricsService,
    );

    await useCase.execute('order-1');
    await createOrder.execute({
      orderId: 'order-1',
      userId: 'user-1',
      totalCents: 100,
    });

    expect(orders.stored('order-1')?.status).toBe(OrderStatus.CANCELLED);
    expect(eventTypes()).not.toContain('OrderCreated');
    expect(metrics.incrementOrdersCreated).not.toHaveBeenCalled();
  });

  it('cancels the order the create request persisted between the read and the tombstone insert', async () => {
    orders.seed('o', OrderStatus.PENDING_PAYMENT);
    jest.spyOn(orders, 'findById').mockResolvedValueOnce(null);

    await useCase.execute('o');

    expect(orders.size).toBe(1);
    expect(orders.stored('o')?.status).toBe(OrderStatus.CANCELLED);
    expect(eventTypes()).toEqual(['OrderCancelled']);
    expect(metrics.incrementOrdersCancelled).toHaveBeenCalledTimes(1);
  });

  it('writes nothing again when already cancelled (redelivery)', async () => {
    orders.seed('o', OrderStatus.CANCELLED);

    await useCase.execute('o');

    expect(orders.events).toHaveLength(0);
    expect(metrics.incrementOrdersCancelled).not.toHaveBeenCalled();
  });

  it('skips a FAILED order', async () => {
    orders.seed('o', OrderStatus.FAILED);

    await useCase.execute('o');

    expect(orders.stored('o')?.status).toBe(OrderStatus.FAILED);
    expect(orders.events).toHaveLength(0);
  });

  it('throws a retryable error when the order changed concurrently', async () => {
    orders.seed('o', OrderStatus.PENDING_PAYMENT);
    jest.spyOn(orders, 'save').mockResolvedValueOnce(false);

    await expect(useCase.execute('o')).rejects.toBeInstanceOf(
      ConcurrentOrderUpdateError,
    );
  });
});
