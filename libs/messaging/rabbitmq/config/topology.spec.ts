import {
  RABBIT_HANDLER,
  RabbitHandlerConfig,
} from '@golevelup/nestjs-rabbitmq';
import { OrderConsumer } from '@order/src/modules/order/consumers/order.consumer';
import { OrderDlqConsumer } from '@order/src/modules/order/consumers/order-dlq.consumer';
import { PaymentConsumer } from '@payment/src/modules/payment/consumers/payment.consumer';
import { PaymentDlqConsumer } from '@payment/src/modules/payment/consumers/payment-dlq.consumer';

import { DLQ } from '../constants';
import { createRabbitMQConfig } from './rabbitmq.base.config';
import { QUEUE_TOPOLOGY } from './topology.config';

jest.mock('@order/prisma/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('@payment/prisma/prisma.service', () => ({
  PrismaService: class {},
}));

const CONSUMERS = [
  OrderConsumer,
  OrderDlqConsumer,
  PaymentConsumer,
  PaymentDlqConsumer,
];

/** Every @RabbitSubscribe declared on the consumers' methods */
function subscriptions(): RabbitHandlerConfig[] {
  return CONSUMERS.flatMap((consumer) => {
    const proto = consumer.prototype as unknown as Record<string, unknown>;

    return Object.getOwnPropertyNames(proto)
      .map((key) => proto[key])
      .filter((member) => typeof member === 'function')
      .map(
        (method) =>
          Reflect.getMetadata(RABBIT_HANDLER, method as object) as
            | RabbitHandlerConfig
            | undefined,
      )
      .filter((config): config is RabbitHandlerConfig => !!config);
  });
}

const asArray = (key?: string | string[]) => [key ?? []].flat().slice().sort();

describe('QUEUE_TOPOLOGY', () => {
  it('is declared by the shared RabbitMQ config', () => {
    expect(createRabbitMQConfig('amqp://localhost').queues).toBe(
      QUEUE_TOPOLOGY,
    );
  });

  it('declares every queue some consumer subscribes to, and nothing else', () => {
    expect(
      subscriptions()
        .map((s) => s.queue)
        .sort(),
    ).toEqual(QUEUE_TOPOLOGY.map((q) => q.name).sort());
  });

  it.each(subscriptions().map((s) => [s.queue, s] as const))(
    '%s matches its @RabbitSubscribe (avoids PRECONDITION_FAILED)',
    (_queue, subscription) => {
      const declared = QUEUE_TOPOLOGY.find(
        (q) => q.name === subscription.queue,
      );

      expect(declared?.options).toEqual(subscription.queueOptions);
      expect(declared?.exchange).toBe(subscription.exchange);
      expect(asArray(declared?.routingKey)).toEqual(
        asArray(subscription.routingKey),
      );
    },
  );

  it('binds every DLQ on the DLX', () => {
    for (const dlq of Object.values(DLQ)) {
      expect(QUEUE_TOPOLOGY).toContainEqual(
        expect.objectContaining({ name: dlq, routingKey: dlq }),
      );
    }
  });
});
