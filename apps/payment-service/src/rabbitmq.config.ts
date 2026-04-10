import { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { rabbitmqBaseConfig } from '@messaging/rabbitmq/config/rabbitmq.base.config';
import { DLQ } from '@messaging/rabbitmq/constants/dlq.constant';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';

export const paymentRabbitmqConfig: RabbitMQConfig = {
  ...(rabbitmqBaseConfig as RabbitMQConfig),

  exchanges: [
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
      name: Queues.PAYMENT_PROCESS,
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': Exchanges.DLX,
          'x-dead-letter-routing-key': DLQ.PAYMENT_PROCESS,
        },
      },
    },
    {
      name: DLQ.PAYMENT_PROCESS,
      options: {
        durable: true,
      },
    },
  ],
};