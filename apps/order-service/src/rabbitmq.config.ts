import { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { rabbitmqBaseConfig } from '@messaging/rabbitmq/config/rabbitmq.base.config';
import { DLQ } from '@messaging/rabbitmq/constants/dlq.constant';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';

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
      name: DLQ.ORDER_CREATE,
      options: { durable: true },
    },
    {
      name: DLQ.ORDER_CANCEL_REQUESTED,
      options: { durable: true },
    },
    {
      name: DLQ.ORDER_PAYMENT_RESULT,
      options: { durable: true },
    },
  ],
};
