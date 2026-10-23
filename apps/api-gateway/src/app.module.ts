import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { createEnvValidator } from '@common/config';
import { RabbitMQModule } from '@messaging/rabbitmq';

import { CustomHttpModule } from './common/http';
import { correlationIdMiddleware } from './common/middleware';
import { GatewayEnvironment } from './config/env.validation';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OrdersModule } from './modules/orders';
import { PaymentsModule } from './modules/payments';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(GatewayEnvironment),
    }),
    CustomHttpModule,
    RabbitMQModule,
    OrdersModule,
    PaymentsModule,
    MetricsModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(correlationIdMiddleware).forRoutes('*');
  }
}
