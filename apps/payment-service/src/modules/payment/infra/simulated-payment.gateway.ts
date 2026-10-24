import { CorrelationLogger } from '@common/logger';

import { ChargeResult, PaymentGateway } from '../domain/ports/payment-gateway';

export const SIMULATED_DECLINE_REASON = 'Insufficient funds';

export interface SimulatedPaymentGatewayOptions {
  latencyMs?: number;
  declineRate?: number;
  /** Injectable for deterministic tests */
  random?: () => number;
}

/**
 * Stand-in for a real provider: ~1.5s latency and ~20% of charges declined
 * for insufficient funds. Like a real provider it is idempotent on
 * paymentId, so a repeated charge returns the first result.
 */
export class SimulatedPaymentGateway implements PaymentGateway {
  private readonly logger = new CorrelationLogger(SimulatedPaymentGateway.name);
  private readonly charges = new Map<string, ChargeResult>();
  private readonly latencyMs: number;
  private readonly declineRate: number;
  private readonly random: () => number;

  constructor({
    latencyMs = 1500,
    declineRate = 0.2,
    random = Math.random,
  }: SimulatedPaymentGatewayOptions = {}) {
    this.latencyMs = latencyMs;
    this.declineRate = declineRate;
    this.random = random;
  }

  async charge(paymentId: string, amount: number): Promise<ChargeResult> {
    const previous = this.charges.get(paymentId);
    if (previous) return previous;

    await this.delay();

    const result: ChargeResult =
      this.random() < this.declineRate
        ? { status: 'declined', reason: SIMULATED_DECLINE_REASON }
        : { status: 'approved' };

    this.charges.set(paymentId, result);
    this.logger.log(`🏦 Charge ${paymentId} (${amount}): ${result.status}`);
    return result;
  }

  async refund(paymentId: string): Promise<void> {
    await this.delay();
    this.logger.log(`🏦 Refund ${paymentId}`);
  }

  private delay() {
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}
