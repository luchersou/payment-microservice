import {
  CallHandler,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';

import { lastValueFrom, of, throwError } from 'rxjs';

import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('HttpMetricsInterceptor', () => {
  const endTimer = jest.fn();
  const metrics = {
    startHttpTimer: jest.fn(() => endTimer),
    incrementHttpRequests: jest.fn(),
  };
  const interceptor = new HttpMetricsInterceptor(
    metrics as unknown as MetricsService,
  );

  // Before the exception filter runs, express still reports 200
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        route: { path: '/api/orders/:id' },
        url: '/api/orders/1',
      }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('records the response status on success', async () => {
    const next: CallHandler = { handle: () => of('ok') };

    await lastValueFrom(interceptor.intercept(context, next));

    expect(metrics.incrementHttpRequests).toHaveBeenCalledWith(
      'GET',
      '/api/orders/:id',
      200,
    );
  });

  it('records the HttpException status on error, not 200', async () => {
    const next: CallHandler = {
      handle: () => throwError(() => new NotFoundException()),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(metrics.incrementHttpRequests).toHaveBeenCalledWith(
      'GET',
      '/api/orders/:id',
      404,
    );
    expect(endTimer).toHaveBeenCalledWith({ status_code: 404 });
  });

  it('records 500 for unexpected errors', async () => {
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toThrow('boom');

    expect(metrics.incrementHttpRequests).toHaveBeenCalledWith(
      'GET',
      '/api/orders/:id',
      500,
    );
  });
});
