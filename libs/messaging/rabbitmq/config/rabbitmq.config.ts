import { Exchanges } from '../constants/exchanges.constant';
import { Queues } from '../constants/queues.constant';
import { DLQ } from '../constants/dlq.constant';
import { Channel } from 'amqplib';
import { RoutingKeys } from '../constants/routing-keys.constant';

export async function setupRabbitMQ(channel: Channel) {
  // ========================
  // EXCHANGES
  // ========================

  await channel.assertExchange(Exchanges.ORDERS, 'topic', {
    durable: true,
  });

  await channel.assertExchange(Exchanges.PAYMENTS, 'topic', {
    durable: true,
  });

  await channel.assertExchange(Exchanges.DLX, 'topic', {
    durable: true,
  });

  // ========================
  // MAIN QUEUES
  // ========================

  await channel.assertQueue(Queues.ORDER_PROCESS, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': Exchanges.DLX,
      'x-dead-letter-routing-key': DLQ.ORDER_PROCESS,
    },
  });

  await channel.assertQueue(Queues.PAYMENT_PROCESS, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': Exchanges.DLX,
      'x-dead-letter-routing-key': DLQ.PAYMENT_PROCESS,
    },
  });

  await channel.assertQueue(Queues.PAYMENT_RESULT, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': Exchanges.DLX,
      'x-dead-letter-routing-key': DLQ.PAYMENT_RESULT,
    },
  });

  // ========================
  // DLQ QUEUES
  // ========================

  await channel.assertQueue(DLQ.ORDER_PROCESS, {
    durable: true,
  });

  await channel.assertQueue(DLQ.PAYMENT_PROCESS, {
    durable: true,
  });

  await channel.assertQueue(DLQ.PAYMENT_RESULT, {
    durable: true,
  });

  // ========================
  // DLX BINDINGS
  // ========================

  await channel.bindQueue(
    DLQ.ORDER_PROCESS,
    Exchanges.DLX,
    DLQ.ORDER_PROCESS,
  );

  await channel.bindQueue(
    DLQ.PAYMENT_PROCESS,
    Exchanges.DLX,
    DLQ.PAYMENT_PROCESS,
  );

  await channel.bindQueue(
    DLQ.PAYMENT_RESULT,
    Exchanges.DLX,
    DLQ.PAYMENT_RESULT,
  );
}
