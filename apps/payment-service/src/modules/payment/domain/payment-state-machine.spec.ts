import { PaymentStatus } from '@payment/prisma/generated/prisma/enums';

import { canTransition } from './payment-state-machine';

describe('payment state machine', () => {
  it('allows cancelling a PROCESSING payment', () => {
    expect(
      canTransition(PaymentStatus.PROCESSING, PaymentStatus.CANCELLED),
    ).toBe(true);
  });

  it('only refunds an APPROVED payment', () => {
    expect(canTransition(PaymentStatus.APPROVED, PaymentStatus.REFUNDED)).toBe(
      true,
    );
    expect(canTransition(PaymentStatus.APPROVED, PaymentStatus.CANCELLED)).toBe(
      false,
    );
  });

  it.each([
    PaymentStatus.DECLINED,
    PaymentStatus.FAILED,
    PaymentStatus.REFUNDED,
    PaymentStatus.CANCELLED,
  ])('treats %s as terminal', (from) => {
    for (const to of Object.values(PaymentStatus)) {
      expect(canTransition(from, to)).toBe(false);
    }
  });
});
