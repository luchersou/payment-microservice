import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { RabbitMQModule } from '@messaging/rabbitmq';

import { CustomHttpModule } from './common/http';
import { correlationIdMiddleware } from './common/middleware';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OrdersModule } from './modules/orders';
import { PaymentsModule } from './modules/payments';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CustomHttpModule,
    RabbitMQModule,
    OrdersModule,
    PaymentsModule,
    MetricsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(correlationIdMiddleware).forRoutes('*');
  }
}
