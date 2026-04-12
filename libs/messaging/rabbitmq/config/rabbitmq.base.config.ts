import { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { Exchanges } from '../constants/exchanges.constant';

export const rabbitmqBaseConfig: Partial<RabbitMQConfig> = {
  uri: process.env.RABBITMQ_URL || 'amqp://localhost:5672',

  connectionInitOptions: { wait: false },

  channels: {
    'channel-1': {
      prefetchCount: 10,
      default: true,
    },
  },

  exchanges: [
    { name: Exchanges.ORDERS, type: 'topic', options: { durable: true } },
    { name: Exchanges.PAYMENTS, type: 'topic', options: { durable: true } },
    { name: Exchanges.DLX, type: 'topic', options: { durable: true } },
  ],
};
