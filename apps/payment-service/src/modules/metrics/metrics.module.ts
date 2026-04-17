import { Module } from '@nestjs/common';

import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { Registry } from 'prom-client';

import { PaymentMetricsService } from './metrics.service';

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
        registry.setDefaultLabels({ app: 'payment-service' });
        return registry;
      },
    },
    PaymentMetricsService,
  ],
  exports: [PaymentMetricsService],
})
export class MetricsModule {}
