import { Exchanges } from '../constants/exchanges.constant';
import { Queues } from '../constants/queues.constant';
import { RoutingKeys } from '../constants/routing-keys.constant';
import { DLQ } from '../constants/dlq.constant';
import { Channel } from 'amqplib';

export async function setupRabbitMQ(channel: Channel) {
  // Exchanges
  await channel.assertExchange(Exchanges.ORDERS, 'topic', { durable: true });
  await channel.assertExchange(Exchanges.PAYMENTS, 'topic', { durable: true });
  await channel.assertExchange(Exchanges.DLX, 'topic', { durable: true });

  // Queues
  await channel.assertQueue(Queues.ORDER_CREATED, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': Exchanges.DLX,
      'x-dead-letter-routing-key': DLQ.ORDER_CREATED,
    },
  });
  await channel.assertQueue(Queues.PAYMENT_PROCESS, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': Exchanges.DLX,
      'x-dead-letter-routing-key': DLQ.PAYMENT_PROCESS,
    },
  });
  await channel.assertQueue(Queues.PAYMENT_RESULT, { durable: true });
  await channel.assertQueue(DLQ.ORDER_CREATED, { durable: true });
  await channel.assertQueue(DLQ.PAYMENT_PROCESS, { durable: true });


  // Bindings
  await channel.bindQueue(
    Queues.ORDER_CREATED,
    Exchanges.ORDERS,
    RoutingKeys.ORDER_CREATED,
  );

  await channel.bindQueue(
    Queues.PAYMENT_PROCESS,
    Exchanges.ORDERS,
    RoutingKeys.ORDER_CREATED,
  );

  await channel.bindQueue(
    Queues.PAYMENT_RESULT,
    Exchanges.PAYMENTS,
    RoutingKeys.PAYMENT_APPROVED,
  );

  await channel.bindQueue(
    Queues.PAYMENT_RESULT,
    Exchanges.PAYMENTS,
    RoutingKeys.PAYMENT_DECLINED,
  );

  await channel.bindQueue(
    DLQ.ORDER_CREATED,
    Exchanges.DLX,
    DLQ.ORDER_CREATED,
  );

  await channel.bindQueue(
    DLQ.PAYMENT_PROCESS,
    Exchanges.DLX,
    DLQ.PAYMENT_PROCESS,
  );

}
