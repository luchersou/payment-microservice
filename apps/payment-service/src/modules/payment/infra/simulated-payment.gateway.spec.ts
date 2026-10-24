import {
  SIMULATED_DECLINE_REASON,
  SimulatedPaymentGateway,
} from './simulated-payment.gateway';

describe('SimulatedPaymentGateway', () => {
  const gatewayWith = (random: number) =>
    new SimulatedPaymentGateway({ latencyMs: 0, random: () => random });

  it('approves when the draw is above the decline rate', async () => {
    await expect(gatewayWith(0.5).authorize('pay-1', 1000)).resolves.toEqual({
      status: 'approved',
    });
  });

  it('declines for insufficient funds below the decline rate', async () => {
    await expect(gatewayWith(0.1).authorize('pay-1', 1000)).resolves.toEqual({
      status: 'declined',
      reason: SIMULATED_DECLINE_REASON,
    });
  });

  it('is idempotent on paymentId', async () => {
    const draws = [0.5, 0.1];
    const gateway = new SimulatedPaymentGateway({
      latencyMs: 0,
      random: () => draws.shift()!,
    });

    const first = await gateway.authorize('pay-1', 1000);
    const second = await gateway.authorize('pay-1', 1000);

    expect(second).toEqual(first);
    expect(draws).toEqual([0.1]);
  });

  it('voids an authorization that was never captured', async () => {
    const gateway = gatewayWith(0.5);
    await gateway.authorize('pay-1', 1000);

    await expect(gateway.release('pay-1')).resolves.toBe('voided');
    await expect(gateway.release('pay-1')).resolves.toBe('nothing');
  });

  it('refunds a captured charge, once', async () => {
    const gateway = gatewayWith(0.5);
    await gateway.authorize('pay-1', 1000);
    await gateway.capture('pay-1');
    await gateway.capture('pay-1');

    await expect(gateway.release('pay-1')).resolves.toBe('refunded');
    await expect(gateway.release('pay-1')).resolves.toBe('nothing');
  });

  it('has nothing to release for a payment never authorized or declined', async () => {
    const gateway = gatewayWith(0.1);
    await gateway.authorize('declined', 1000);

    await expect(gateway.release('never-seen')).resolves.toBe('nothing');
    await expect(gateway.release('declined')).resolves.toBe('nothing');
  });
});
