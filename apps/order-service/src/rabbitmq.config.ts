import { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { DLQ, Exchanges, rabbitmqBaseConfig } from '@messaging/rabbitmq';

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
