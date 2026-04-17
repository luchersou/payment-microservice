import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { Registry, register } from 'prom-client';

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
        register.setDefaultLabels({ app: 'payment-service' });
        return register;
      },
    },
    PaymentMetricsService,
  ],
  exports: [PaymentMetricsService],
})
export class MetricsModule {}