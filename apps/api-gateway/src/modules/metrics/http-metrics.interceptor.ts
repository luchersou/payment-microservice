import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';

import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();

    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const method = request.method;
    const route =
      (request.route as { path?: string } | undefined)?.path ?? request.url;

    const endTimer = this.metrics.startHttpTimer({
      method,
      route,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          const statusCode = response.statusCode;

          this.metrics.incrementHttpRequests(method, route, statusCode);

          endTimer({ status_code: statusCode });
        },
        error: (error: unknown) => {
          // The exception filter has not written the response yet, so
          // response.statusCode is still 200 here: derive it from the error.
          const statusCode =
            error instanceof HttpException
              ? error.getStatus()
              : HttpStatus.INTERNAL_SERVER_ERROR;

          this.metrics.incrementHttpRequests(method, route, statusCode);

          endTimer({ status_code: statusCode });
        },
      }),
    );
  }
}
