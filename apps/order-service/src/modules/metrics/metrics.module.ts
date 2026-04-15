import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { Registry } from 'prom-client';

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
        const registry = new Registry();
        registry.setDefaultLabels({ app: 'order-service' });
        return registry;
      },
    },
    OrderMetricsService,
  ],
  exports: [OrderMetricsService],
})
export class MetricsModule {}