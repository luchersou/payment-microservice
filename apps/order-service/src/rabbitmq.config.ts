import { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { rabbitmqBaseConfig } from '@messaging/rabbitmq/config/rabbitmq.base.config';
import { DLQ } from '@messaging/rabbitmq/constants/dlq.constant';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';

export const orderRabbitmqConfig: RabbitMQConfig = {
  ...(rabbitmqBaseConfig as RabbitMQConfig),

  exchanges: [
    {
      name: Exchanges.ORDERS,
      type: 'topic',
    },
    {
      name: Exchanges.PAYMENTS,
      type: 'topic',
    },
    {
      name: Exchanges.DLX,
      type: 'topic',
    },
  ],

  queues: [
    {
      name: Queues.ORDER_PROCESS,
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': Exchanges.DLX,
          'x-dead-letter-routing-key': DLQ.ORDER_PROCESS,
        },
      },
    },
    {
      name: 'order.payment-result.queue', 
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': Exchanges.DLX,
          'x-dead-letter-routing-key': 'dlq.order.payment-result',
        },
      },
    },
    {
      name: DLQ.ORDER_PROCESS,
      options: { durable: true },
    },
    {
      name: 'dlq.order.payment-result',
      options: { durable: true },
    },
  ],
};