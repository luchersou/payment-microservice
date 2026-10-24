import { canTransition } from './order-state-machine';
import { OrderStatus } from './order-status';

export class InvalidOrderTransitionError extends Error {
  constructor(orderId: string, from: OrderStatus, to: OrderStatus) {
    super(`Order ${orderId} cannot go from ${from} to ${to}`);
    this.name = InvalidOrderTransitionError.name;
  }
}

/** What happened to an order that the rest of the saga must hear about */
export type OrderEvent =
  | {
      type: 'OrderCreated';
      orderId: string;
      userId: string;
      totalCents: number;
    }
  | { type: 'OrderCancelled'; orderId: string; cancelledAt: Date };

export interface OrderProps {
  id: string;
  /** Null for a tombstone (cancelled before creation); totalCents in cents */
  userId: string | null;
  totalCents: number | null;
  status: OrderStatus;
}

/**
 * An order and its lifecycle. Every change goes through the state machine
 * and records the event to announce, which the repository persists in the
 * same transaction as the order (outbox).
 *
 * `loadedStatus` is the status the order had when it was read (null for a
 * new one): the repository only saves if the stored status is still that
 * one, so concurrent events cannot overwrite each other.
 */
export class Order {
  readonly loadedStatus: OrderStatus | null;
  private readonly events: OrderEvent[] = [];

  private constructor(
    private readonly props: OrderProps,
    isNew: boolean,
  ) {
    this.loadedStatus = isNew ? null : props.status;
  }

  /** New order waiting for its payment; announces OrderCreated */
  static create(id: string, userId: string, totalCents: number): Order {
    const order = new Order(
      { id, userId, totalCents, status: OrderStatus.PENDING_PAYMENT },
      true,
    );
    order.events.push({
      type: 'OrderCreated',
      orderId: id,
      userId,
      totalCents,
    });
    return order;
  }

  /**
   * The gateway returns the orderId before the order exists, so a cancel can
   * be handled before its create request. The tombstone takes the id, so
   * the create that arrives later finds it CANCELLED and does nothing.
   */
  static cancelledTombstone(id: string): Order {
    const order = new Order(
      { id, userId: null, totalCents: null, status: OrderStatus.CANCELLED },
      true,
    );
    order.recordCancelled();
    return order;
  }

  static fromProps(props: OrderProps): Order {
    return new Order({ ...props }, false);
  }

  get id() {
    return this.props.id;
  }

  get userId() {
    return this.props.userId;
  }

  get totalCents() {
    return this.props.totalCents;
  }

  get status() {
    return this.props.status;
  }

  canMoveTo(to: OrderStatus): boolean {
    return canTransition(this.props.status, to);
  }

  markPaid() {
    this.moveTo(OrderStatus.PAID);
  }

  /** Payment declined or failed: nothing to compensate, nothing announced */
  fail() {
    this.moveTo(OrderStatus.FAILED);
  }

  /** User cancel; the payment service compensates on OrderCancelled */
  cancel() {
    this.moveTo(OrderStatus.CANCELLED);
    this.recordCancelled();
  }

  /** Events recorded since the order was loaded or created, emptying the list */
  pullEvents(): OrderEvent[] {
    return this.events.splice(0);
  }

  private recordCancelled() {
    this.events.push({
      type: 'OrderCancelled',
      orderId: this.id,
      cancelledAt: new Date(),
    });
  }

  private moveTo(to: OrderStatus) {
    if (!this.canMoveTo(to)) {
      throw new InvalidOrderTransitionError(this.id, this.props.status, to);
    }
    this.props.status = to;
  }
}
