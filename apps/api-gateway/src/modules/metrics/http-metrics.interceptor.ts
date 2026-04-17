import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();

    const request = http.getRequest();
    const response = http.getResponse();

    const method = request.method;
    const route = request.route?.path ?? request.routerPath ?? request.url;

    const endTimer = this.metrics.startHttpTimer({
      method,
      route,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;

          this.metrics.incrementHttpRequests(
            method,
            route,
            statusCode,
          );

          endTimer({ status_code: statusCode });
        },
        error: () => {
          const statusCode = response.statusCode || 500;

          this.metrics.incrementHttpRequests(
            method,
            route,
            statusCode,
          );

          endTimer({ status_code: statusCode });
        },
      }),
    );
  }
}