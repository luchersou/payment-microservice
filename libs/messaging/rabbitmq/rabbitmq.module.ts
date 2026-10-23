import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RabbitMQModule as GolevelupRabbitMQModule } from '@golevelup/nestjs-rabbitmq';

import { createRabbitMQConfig } from './config/rabbitmq.base.config';

/**
 * Single RabbitMQ connection per service. Import it once in AppModule;
 * it is global, so feature modules get AmqpConnection without importing it.
 */
@Global()
@Module({
  imports: [
    GolevelupRabbitMQModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createRabbitMQConfig(config.getOrThrow<string>('RABBITMQ_URL')),
    }),
  ],
  exports: [GolevelupRabbitMQModule],
})
export class RabbitMQModule {}
