import { ChargeResult } from '../../domain/ports/payment-gateway';

/** Deterministic gateway: approves unless a test says otherwise */
export function makeGateway() {
  return {
    charge: jest
      .fn<Promise<ChargeResult>, [string, number]>()
      .mockResolvedValue({ status: 'approved' }),
    refund: jest.fn<Promise<boolean>, [string]>().mockResolvedValue(true),
  };
}

export function makeMetrics() {
  return {
    startMessageProcessingTimer: jest.fn(() => jest.fn()),
    incrementPaymentsApproved: jest.fn(),
    incrementPaymentsDeclined: jest.fn(),
    incrementPaymentsFailed: jest.fn(),
    incrementPaymentsRefunded: jest.fn(),
    incrementPaymentsCancelled: jest.fn(),
    incrementPaymentsReconciled: jest.fn(),
  };
}
