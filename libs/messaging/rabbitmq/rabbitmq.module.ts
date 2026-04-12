import { Global, Module } from '@nestjs/common';
import { RabbitMQModule as GolevelupRabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { rabbitmqBaseConfig } from '@messaging/rabbitmq';

@Global()
@Module({
  imports: [
    GolevelupRabbitMQModule.forRootAsync({
      useFactory: () => rabbitmqBaseConfig as any,
    }),
  ],
  exports: [GolevelupRabbitMQModule],
})
export class RabbitMQModule {}
