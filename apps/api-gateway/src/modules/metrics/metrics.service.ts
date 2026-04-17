import { Injectable } from '@nestjs/common';

import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDuration: Histogram<string>;

  constructor(private readonly registry: Registry) {
    this.httpRequestsTotal =
      (this.registry.getSingleMetric(
        'http_requests_total',
      ) as Counter<string>) ??
      new Counter({
        name: 'http_requests_total',
        help: 'Total number of HTTP requests',
        labelNames: ['method', 'route', 'status_code'],
        registers: [this.registry],
      });

    this.httpRequestDuration =
      (this.registry.getSingleMetric(
        'http_request_duration_seconds',
      ) as Histogram<string>) ??
      new Histogram({
        name: 'http_request_duration_seconds',
        help: 'Duration of HTTP requests in seconds',
        labelNames: ['method', 'route'],
        buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
        registers: [this.registry],
      });
  }

  incrementHttpRequests(
    method: string,
    route: string,
    statusCode: number,
  ): void {
    this.httpRequestsTotal.inc({
      method,
      route,
      status_code: statusCode.toString(),
    });
  }

  startHttpTimer(labels: {
    method: string;
    route: string;
  }): (labels: { status_code: number }) => void {
    const end = this.httpRequestDuration.startTimer({
      method: labels.method,
      route: labels.route,
    });

    return () => {
      end();
    };
  }
}
