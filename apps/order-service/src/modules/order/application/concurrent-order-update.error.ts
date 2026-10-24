/** The order changed between read and conditional save; the retry re-reads it */
export class ConcurrentOrderUpdateError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} was updated concurrently`);
    this.name = ConcurrentOrderUpdateError.name;
  }
}
