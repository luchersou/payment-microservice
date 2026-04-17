import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { Registry, register } from 'prom-client';

import { OrderMetricsService } from './metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  providers: [
    {
      provide: Registry,
      useFactory: () => {
        register.setDefaultLabels({ app: 'order-service' });
        return register;
      },
    },
    OrderMetricsService,
  ],
  exports: [OrderMetricsService],
})
export class MetricsModule {}