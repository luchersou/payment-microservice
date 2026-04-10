import { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { rabbitmqBaseConfig } from '@messaging/rabbitmq/config/rabbitmq.base.config';
import { DLQ } from '@messaging/rabbitmq/constants/dlq.constant';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';

export const orderRabbitmqConfig: RabbitMQConfig = {
  ...(rabbitmqBaseConfig as RabbitMQConfig),

  queues: [
    // Main queues
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
      name: Queues.PAYMENT_RESULT,
      options: {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': Exchanges.DLX,
          'x-dead-letter-routing-key': DLQ.PAYMENT_RESULT,
        },
      },
    },

    // DLQs
    { name: DLQ.ORDER_PROCESS, options: { durable: true } },
    { name: DLQ.PAYMENT_RESULT, options: { durable: true } },
  ],
};