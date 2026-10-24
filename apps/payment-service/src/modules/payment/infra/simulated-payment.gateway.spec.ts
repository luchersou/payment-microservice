import {
  SIMULATED_DECLINE_REASON,
  SimulatedPaymentGateway,
} from './simulated-payment.gateway';

describe('SimulatedPaymentGateway', () => {
  const gatewayWith = (random: number) =>
    new SimulatedPaymentGateway({ latencyMs: 0, random: () => random });

  it('approves when the draw is above the decline rate', async () => {
    await expect(gatewayWith(0.5).charge('pay-1', 1000)).resolves.toEqual({
      status: 'approved',
    });
  });

  it('declines for insufficient funds below the decline rate', async () => {
    await expect(gatewayWith(0.1).charge('pay-1', 1000)).resolves.toEqual({
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

    const first = await gateway.charge('pay-1', 1000);
    const second = await gateway.charge('pay-1', 1000);

    expect(second).toEqual(first);
    expect(draws).toEqual([0.1]);
  });

  it('refunds an approved charge only once', async () => {
    const gateway = gatewayWith(0.5);
    await gateway.charge('pay-1', 1000);

    await expect(gateway.refund('pay-1')).resolves.toBe(true);
    await expect(gateway.refund('pay-1')).resolves.toBe(false);
  });

  it('has nothing to refund for a payment never charged or declined', async () => {
    const gateway = gatewayWith(0.1);
    await gateway.charge('declined', 1000);

    await expect(gateway.refund('never-charged')).resolves.toBe(false);
    await expect(gateway.refund('declined')).resolves.toBe(false);
  });
});
