import { OrderStatus } from '@order/prisma/generated/prisma/enums';

import { sourceStatusesFor } from './order-state-machine';

describe('sourceStatusesFor', () => {
  it('only allows PAID from PENDING_PAYMENT', () => {
    expect(sourceStatusesFor(OrderStatus.PAID)).toEqual([
      OrderStatus.PENDING_PAYMENT,
    ]);
  });

  it('allows CANCELLED from PENDING_PAYMENT and PAID', () => {
    expect(sourceStatusesFor(OrderStatus.CANCELLED)).toEqual([
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.PAID,
    ]);
  });

  it('only allows FAILED from PENDING_PAYMENT', () => {
    expect(sourceStatusesFor(OrderStatus.FAILED)).toEqual([
      OrderStatus.PENDING_PAYMENT,
    ]);
  });

  it('never allows going back to PENDING_PAYMENT', () => {
    expect(sourceStatusesFor(OrderStatus.PENDING_PAYMENT)).toEqual([]);
  });
});
