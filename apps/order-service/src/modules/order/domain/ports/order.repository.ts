import { Order } from '../order';

export const ORDER_REPOSITORY = Symbol('ORDER_REPOSITORY');

/** Orders are keyed by the id the gateway generates, which makes create idempotent */
export interface OrderRepository {
  findById(id: string): Promise<Order | null>;

  /**
   * Inserts a new order and its pending events atomically. Returns false
   * (inserting nothing) if an order with that id already exists.
   */
  create(order: Order): Promise<boolean>;

  /**
   * Persists the order's new status and its pending events atomically,
   * only if the stored status is still `order.loadedStatus`. Returns false
   * (saving nothing) when it changed concurrently.
   */
  save(order: Order): Promise<boolean>;
}
