import { RabbitMQConfig } from '@golevelup/nestjs-rabbitmq';

import { Exchanges, rabbitmqBaseConfig } from '@messaging/rabbitmq';

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
};
