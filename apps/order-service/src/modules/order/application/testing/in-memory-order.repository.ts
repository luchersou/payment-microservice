import { Order, OrderEvent, OrderProps } from '../../domain/order';
import { OrderStatus } from '../../domain/order-status';
import { OrderRepository } from '../../domain/ports/order.repository';

/**
 * OrderRepository with the same contract as the Prisma one (unique id,
 * conditional save, events stored only with a successful write), for
 * use-case tests.
 */
export class InMemoryOrderRepository implements OrderRepository {
  /** Events "written to the outbox" */
  readonly events: OrderEvent[] = [];
  /** Makes the next create/save throw, as a database failure would */
  failNextWrite?: Error;

  private readonly byId = new Map<string, OrderProps>();

  seed(id: string, status: OrderStatus): Order {
    const props: OrderProps = { id, userId: 'user-1', total: 100, status };
    this.byId.set(id, props);
    return Order.fromProps(props);
  }

  /** What is stored, as another process would see it */
  stored(id: string): OrderProps | undefined {
    const props = this.byId.get(id);
    return props && { ...props };
  }

  get size() {
    return this.byId.size;
  }

  findById(id: string): Promise<Order | null> {
    const props = this.byId.get(id);
    return Promise.resolve(props ? Order.fromProps(props) : null);
  }

  create(order: Order): Promise<boolean> {
    const events = order.pullEvents();
    this.throwIfFailing();

    if (this.byId.has(order.id)) return Promise.resolve(false);

    this.byId.set(order.id, {
      id: order.id,
      userId: order.userId,
      total: order.total,
      status: order.status,
    });
    this.events.push(...events);
    return Promise.resolve(true);
  }

  save(order: Order): Promise<boolean> {
    const events = order.pullEvents();
    this.throwIfFailing();

    const stored = this.byId.get(order.id);
    if (!stored || stored.status !== order.loadedStatus) {
      return Promise.resolve(false);
    }

    stored.status = order.status;
    this.events.push(...events);
    return Promise.resolve(true);
  }

  private throwIfFailing() {
    if (this.failNextWrite) {
      const error = this.failNextWrite;
      this.failNextWrite = undefined;
      throw error;
    }
  }
}
