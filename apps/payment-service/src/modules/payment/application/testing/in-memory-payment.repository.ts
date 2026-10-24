import { Payment, PaymentEvent, PaymentProps } from '../../domain/payment';
import { PaymentStatus } from '../../domain/payment-status';
import { PaymentRepository } from '../../domain/ports/payment.repository';

/**
 * PaymentRepository with the same contract as the Prisma one (unique
 * orderId, conditional save, events stored only with a successful save),
 * for use-case tests.
 */
export class InMemoryPaymentRepository implements PaymentRepository {
  /** Events "written to the outbox" */
  readonly events: PaymentEvent[] = [];
  /** Makes the next save throw, as a database failure would */
  failNextSave?: Error;

  private readonly byOrder = new Map<string, PaymentProps>();
  private seq = 0;

  seed(
    orderId: string,
    status: PaymentStatus,
    extra: Partial<PaymentProps> = {},
  ): Payment {
    const props: PaymentProps = {
      id: `pay-${++this.seq}`,
      orderId,
      amount: 100,
      status,
      failureReason: null,
      ...extra,
    };
    this.byOrder.set(orderId, props);
    return Payment.fromProps(props);
  }

  /** What is stored, as another process would see it */
  stored(orderId: string): PaymentProps | undefined {
    const props = this.byOrder.get(orderId);
    return props && { ...props };
  }

  /** Simulates a concurrent change made by someone else */
  setStatus(orderId: string, status: PaymentStatus) {
    this.byOrder.get(orderId)!.status = status;
  }

  get size() {
    return this.byOrder.size;
  }

  findByOrderId(orderId: string): Promise<Payment | null> {
    const props = this.byOrder.get(orderId);
    return Promise.resolve(props ? Payment.fromProps(props) : null);
  }

  createProcessing(orderId: string, amount: number): Promise<Payment | null> {
    return this.createUnlessExists(orderId, amount, PaymentStatus.PROCESSING);
  }

  createCancelledTombstone(orderId: string): Promise<Payment | null> {
    return this.createUnlessExists(orderId, null, PaymentStatus.CANCELLED);
  }

  save(payment: Payment): Promise<boolean> {
    const events = payment.pullEvents();

    if (this.failNextSave) {
      const error = this.failNextSave;
      this.failNextSave = undefined;
      return Promise.reject(error);
    }

    const stored = this.byOrder.get(payment.orderId);
    if (!stored || stored.status !== payment.loadedStatus) {
      return Promise.resolve(false);
    }

    stored.status = payment.status;
    stored.failureReason = payment.failureReason;
    this.events.push(...events);
    return Promise.resolve(true);
  }

  findStuckProcessing(): Promise<Payment[]> {
    return Promise.resolve(
      [...this.byOrder.values()]
        .filter((p) => p.status === PaymentStatus.PROCESSING)
        .map((p) => Payment.fromProps(p)),
    );
  }

  private createUnlessExists(
    orderId: string,
    amount: number | null,
    status: PaymentStatus,
  ): Promise<Payment | null> {
    if (this.byOrder.has(orderId)) return Promise.resolve(null);
    return Promise.resolve(this.seed(orderId, status, { amount }));
  }
}
