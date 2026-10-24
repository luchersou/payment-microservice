import { CorrelationLogger } from '@common/logger';

import {
  ChargeResult,
  PaymentGateway,
  ReleaseResult,
} from '../domain/ports/payment-gateway';

export const SIMULATED_DECLINE_REASON = 'Insufficient funds';

export interface SimulatedPaymentGatewayOptions {
  latencyMs?: number;
  declineRate?: number;
  /** Injectable for deterministic tests */
  random?: () => number;
}

type ChargeState = 'declined' | 'authorized' | 'captured';

/**
 * Stand-in for a real provider: ~1.5s authorization latency and ~20% of
 * authorizations declined for insufficient funds. Like a real provider it
 * is idempotent on paymentId: a repeated authorization returns the first
 * result, and capture/release only act once.
 */
export class SimulatedPaymentGateway implements PaymentGateway {
  private readonly logger = new CorrelationLogger(SimulatedPaymentGateway.name);
  private readonly charges = new Map<string, ChargeState>();
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

  async authorize(
    paymentId: string,
    amountCents: number,
  ): Promise<ChargeResult> {
    const previous = this.charges.get(paymentId);
    if (previous) return toResult(previous);

    await this.delay();

    const state: ChargeState =
      this.random() < this.declineRate ? 'declined' : 'authorized';

    this.charges.set(paymentId, state);
    this.logger.log(`🏦 Authorize ${paymentId} (${amountCents}): ${state}`);
    return toResult(state);
  }

  capture(paymentId: string): Promise<void> {
    if (this.charges.get(paymentId) === 'authorized') {
      this.charges.set(paymentId, 'captured');
      this.logger.log(`🏦 Capture ${paymentId}`);
    }
    return Promise.resolve();
  }

  release(paymentId: string): Promise<ReleaseResult> {
    const state = this.charges.get(paymentId);

    if (state === 'authorized' || state === 'captured') {
      this.charges.delete(paymentId);
      const result = state === 'authorized' ? 'voided' : 'refunded';
      this.logger.log(`🏦 Release ${paymentId}: ${result}`);
      return Promise.resolve(result);
    }

    return Promise.resolve('nothing');
  }

  private delay() {
    return new Promise((resolve) => setTimeout(resolve, this.latencyMs));
  }
}

function toResult(state: ChargeState): ChargeResult {
  return state === 'declined'
    ? { status: 'declined', reason: SIMULATED_DECLINE_REASON }
    : { status: 'approved' };
}
