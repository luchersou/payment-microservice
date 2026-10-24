import { RabbitMQQueueConfig } from '@golevelup/nestjs-rabbitmq';

import { DLQ, Exchanges, Queues, RoutingKeys } from '../constants';
import {
  DLQ_QUEUE_OPTIONS,
  ORDER_CANCEL_REQUESTED_QUEUE_OPTIONS,
  ORDER_CREATE_QUEUE_OPTIONS,
  ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
  PAYMENT_ORDER_CANCELLED_QUEUE_OPTIONS,
  PAYMENT_ORDER_CREATED_QUEUE_OPTIONS,
} from './queue-options.config';

/**
 * Every queue, binding and DLQ of the saga, declared by every service at
 * boot. Without it a queue only exists once its consumer has started, and a
 * topic exchange silently drops what it cannot route: on a fresh broker the
 * gateway could accept an order (202) whose message went nowhere.
 *
 * Options must be identical to the ones in @RabbitSubscribe (both use the
 * constants from queue-options.config), otherwise RabbitMQ rejects the second
 * declaration with PRECONDITION_FAILED.
 */
export const QUEUE_TOPOLOGY: RabbitMQQueueConfig[] = [
  {
    name: Queues.ORDER_CREATE,
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CREATE_REQUESTED,
    options: ORDER_CREATE_QUEUE_OPTIONS,
  },
  {
    name: Queues.ORDER_CANCEL_REQUESTED,
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CANCEL_REQUESTED,
    options: ORDER_CANCEL_REQUESTED_QUEUE_OPTIONS,
  },
  {
    name: Queues.ORDER_PAYMENT_RESULT,
    exchange: Exchanges.PAYMENTS,
    routingKey: [
      RoutingKeys.PAYMENT_APPROVED,
      RoutingKeys.PAYMENT_DECLINED,
      RoutingKeys.PAYMENT_FAILED,
      RoutingKeys.PAYMENT_REFUNDED,
    ],
    options: ORDER_PAYMENT_RESULT_QUEUE_OPTIONS,
  },
  {
    name: Queues.PAYMENT_ORDER_CREATED,
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CREATED,
    options: PAYMENT_ORDER_CREATED_QUEUE_OPTIONS,
  },
  {
    name: Queues.PAYMENT_ORDER_CANCELLED,
    exchange: Exchanges.ORDERS,
    routingKey: RoutingKeys.ORDER_CANCELLED,
    options: PAYMENT_ORDER_CANCELLED_QUEUE_OPTIONS,
  },

  // Each DLQ is bound on the DLX with its own name as the routing key
  ...Object.values(DLQ).map((dlq) => ({
    name: dlq,
    exchange: Exchanges.DLX,
    routingKey: dlq,
    options: DLQ_QUEUE_OPTIONS,
  })),
];
