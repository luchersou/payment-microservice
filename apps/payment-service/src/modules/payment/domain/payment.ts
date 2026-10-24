import { canTransition } from './payment-state-machine';
import { PaymentStatus } from './payment-status';

export class InvalidPaymentTransitionError extends Error {
  constructor(paymentId: string, from: PaymentStatus, to: PaymentStatus) {
    super(`Payment ${paymentId} cannot go from ${from} to ${to}`);
    this.name = InvalidPaymentTransitionError.name;
  }
}

/** What happened to a payment that the rest of the saga must hear about */
export type PaymentEvent =
  | { type: 'PaymentApproved'; paymentId: string; orderId: string }
  | { type: 'PaymentDeclined'; orderId: string; reason: string }
  | { type: 'PaymentFailed'; orderId: string; error: string };

export interface PaymentProps {
  id: string;
  orderId: string;
  /** Null for a tombstone: the order was cancelled before OrderCreated */
  amount: number | null;
  status: PaymentStatus;
  failureReason: string | null;
}

/**
 * A payment and its lifecycle. Every change goes through the state machine
 * and records the event to announce, which the repository persists in the
 * same transaction as the new status (outbox).
 *
 * `loadedStatus` is the status the payment had when it was read: the
 * repository only saves if the stored status is still that one, so two
 * concurrent changes (e.g. approval and cancel) can never both win.
 */
export class Payment {
  readonly loadedStatus: PaymentStatus;
  private readonly events: PaymentEvent[] = [];

  private constructor(private readonly props: PaymentProps) {
    this.loadedStatus = props.status;
  }

  static fromProps(props: PaymentProps): Payment {
    return new Payment({ ...props });
  }

  get id() {
    return this.props.id;
  }

  get orderId() {
    return this.props.orderId;
  }

  get amount() {
    return this.props.amount;
  }

  get status() {
    return this.props.status;
  }

  get failureReason() {
    return this.props.failureReason;
  }

  /**
   * Created by OrderCreated, so a charge may have been attempted. A
   * tombstone (cancelled before OrderCreated) never was.
   */
  get mayHaveBeenCharged(): boolean {
    return this.props.amount !== null;
  }

  approve() {
    this.moveTo(PaymentStatus.APPROVED);
    this.events.push({
      type: 'PaymentApproved',
      paymentId: this.id,
      orderId: this.orderId,
    });
  }

  decline(reason: string) {
    this.moveTo(PaymentStatus.DECLINED);
    this.props.failureReason = reason;
    this.events.push({
      type: 'PaymentDeclined',
      orderId: this.orderId,
      reason,
    });
  }

  fail(error: string) {
    this.moveTo(PaymentStatus.FAILED);
    this.props.failureReason = error;
    this.events.push({ type: 'PaymentFailed', orderId: this.orderId, error });
  }

  /** Order cancelled while the payment was still PROCESSING */
  cancel() {
    this.moveTo(PaymentStatus.CANCELLED);
  }

  /** Order cancelled after the payment was APPROVED */
  refund() {
    this.moveTo(PaymentStatus.REFUNDED);
  }

  /** Events recorded since the payment was loaded, emptying the list */
  pullEvents(): PaymentEvent[] {
    return this.events.splice(0);
  }

  private moveTo(to: PaymentStatus) {
    if (!canTransition(this.props.status, to)) {
      throw new InvalidPaymentTransitionError(this.id, this.props.status, to);
    }
    this.props.status = to;
  }
}
