import {
  ChargeResult,
  ReleaseResult,
} from '../../domain/ports/payment-gateway';

/** Deterministic gateway: approves unless a test says otherwise */
export function makeGateway() {
  return {
    authorize: jest
      .fn<Promise<ChargeResult>, [string, number]>()
      .mockResolvedValue({ status: 'approved' }),
    capture: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined),
    release: jest
      .fn<Promise<ReleaseResult>, [string]>()
      .mockResolvedValue('voided'),
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
    incrementAuthorizationsVoided: jest.fn(),
  };
}
