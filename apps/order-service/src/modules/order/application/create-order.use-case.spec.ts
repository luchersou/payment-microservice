import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderStatus } from '../domain/order-status';
import { CreateOrderUseCase } from './create-order.use-case';
import { InMemoryOrderRepository } from './testing/in-memory-order.repository';
import { makeMetrics } from './testing/test-doubles';

describe('CreateOrderUseCase', () => {
  let orders: InMemoryOrderRepository;
  let metrics: ReturnType<typeof makeMetrics>;
  let useCase: CreateOrderUseCase;

  const payload = { orderId: 'order-1', userId: 'user-1', total: 100 };

  beforeEach(() => {
    orders = new InMemoryOrderRepository();
    metrics = makeMetrics();
    useCase = new CreateOrderUseCase(
      orders,
      metrics as unknown as OrderMetricsService,
    );
  });

  it('persists the order with the given id together with OrderCreated', async () => {
    await useCase.execute(payload);

    expect(orders.stored('order-1')).toEqual({
      id: 'order-1',
      userId: 'user-1',
      total: 100,
      status: OrderStatus.PENDING_PAYMENT,
    });
    expect(orders.events).toEqual([
      {
        type: 'OrderCreated',
        orderId: 'order-1',
        userId: 'user-1',
        total: 100,
      },
    ]);
    expect(metrics.incrementOrdersCreated).toHaveBeenCalledTimes(1);
  });

  it('creates nothing again on redelivery', async () => {
    await useCase.execute(payload);
    await useCase.execute(payload);

    expect(orders.size).toBe(1);
    expect(orders.events).toHaveLength(1);
    expect(metrics.incrementOrdersCreated).toHaveBeenCalledTimes(1);
  });

  it('writes neither the order nor its event when the database fails, so the retry creates both', async () => {
    orders.failNextWrite = new Error('db down');

    await expect(useCase.execute(payload)).rejects.toThrow('db down');
    expect(orders.size).toBe(0);

    await useCase.execute(payload);

    expect(orders.events.map((e) => e.type)).toEqual(['OrderCreated']);
  });

  it('writes nothing when the order already progressed', async () => {
    orders.seed('order-1', OrderStatus.PAID);

    await useCase.execute(payload);

    expect(orders.events).toHaveLength(0);
    expect(orders.stored('order-1')?.status).toBe(OrderStatus.PAID);
  });

  it('generates an id for requests published before the gateway sent one', async () => {
    await useCase.execute({ userId: 'user-1', total: 100 });

    expect(orders.size).toBe(1);
  });
});
