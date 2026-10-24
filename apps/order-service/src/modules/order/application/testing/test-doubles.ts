export function makeMetrics() {
  return {
    startMessageProcessingTimer: jest.fn(() => jest.fn()),
    incrementOrdersCreated: jest.fn(),
    incrementOrdersCompleted: jest.fn(),
    incrementOrdersCancelled: jest.fn(),
    incrementOrdersFailed: jest.fn(),
    setOrdersStuckPendingPayment: jest.fn(),
  };
}
