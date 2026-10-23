import {
  MessageHandlerErrorBehavior,
  RabbitMQConfig,
} from '@golevelup/nestjs-rabbitmq';

import { Exchanges } from '../constants';

export function createRabbitMQConfig(uri: string): RabbitMQConfig {
  return {
    uri,

    connectionInitOptions: { wait: false },

    /**
     * Safety net for subscribers without an explicit errorHandler: the library
     * default is REQUEUE, which loops poison messages forever and never reaches
     * the DLX. NACK (no requeue) lets the queue's dead-letter config take over.
     */
    defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK,

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
}
