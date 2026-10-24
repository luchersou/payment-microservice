import { InvalidOrderTransitionError, Order } from './order';
import { OrderStatus } from './order-status';

const existing = (status: OrderStatus) =>
  Order.fromProps({ id: 'o', userId: 'u', total: 100, status });

describe('Order', () => {
  it('creates a PENDING_PAYMENT order that announces OrderCreated', () => {
    const order = Order.create('o', 'u', 100);

    expect(order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(order.loadedStatus).toBeNull();
    expect(order.pullEvents()).toEqual([
      { type: 'OrderCreated', orderId: 'o', userId: 'u', total: 100 },
    ]);
  });

  it('creates a tombstone that is already CANCELLED and announces it', () => {
    const tombstone = Order.cancelledTombstone('o');

    expect(tombstone).toMatchObject({
      status: OrderStatus.CANCELLED,
      userId: null,
      total: null,
    });
    expect(tombstone.pullEvents()).toEqual([
      { type: 'OrderCancelled', orderId: 'o', cancelledAt: expect.any(Date) },
    ]);
  });

  it('only announces cancellations', () => {
    const paid = existing(OrderStatus.PENDING_PAYMENT);
    const failed = existing(OrderStatus.PENDING_PAYMENT);
    const cancelled = existing(OrderStatus.PAID);

    paid.markPaid();
    failed.fail();
    cancelled.cancel();

    expect(paid.pullEvents()).toEqual([]);
    expect(failed.pullEvents()).toEqual([]);
    expect(cancelled.pullEvents().map((e) => e.type)).toEqual([
      'OrderCancelled',
    ]);
    expect(cancelled.loadedStatus).toBe(OrderStatus.PAID);
  });

  it('rejects transitions the state machine does not allow', () => {
    expect(() => existing(OrderStatus.CANCELLED).markPaid()).toThrow(
      InvalidOrderTransitionError,
    );
    expect(() => existing(OrderStatus.PAID).fail()).toThrow(
      InvalidOrderTransitionError,
    );
    expect(existing(OrderStatus.FAILED).canMoveTo(OrderStatus.CANCELLED)).toBe(
      false,
    );
  });
});
