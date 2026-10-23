import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AxiosError, AxiosResponse } from 'axios';
import {
  catchError,
  firstValueFrom,
  Observable,
  tap,
  timeout,
  TimeoutError,
} from 'rxjs';

import { CorrelationIdService } from '@common/context';

/**
 * Proxies a downstream HTTP call and maps failures to gateway semantics:
 * - downstream 404 → 404 (with notFoundMessage when given)
 * - other downstream 4xx → same status and body (client error)
 * - downstream 5xx → 502 Bad Gateway
 * - no response (connection refused, DNS…) → 503 Service Unavailable
 * - timeout → 504 Gateway Timeout
 */
export async function makeHttpRequest<T>(
  observable: Observable<AxiosResponse<T>>,
  timeoutMs: number,
  notFoundMessage?: string,
): Promise<T> {
  const correlationId = CorrelationIdService.getId();

  const response = await firstValueFrom(
    observable.pipe(
      tap((response) => {
        Logger.log(
          `[${correlationId}] ${response.config.method?.toUpperCase()} ${
            response.config.url
          } - ${response.status}`,
        );
      }),
      timeout(timeoutMs),
      catchError((error: unknown) => {
        throw toHttpException(error, correlationId, timeoutMs, notFoundMessage);
      }),
    ),
  );

  return response.data;
}

function toHttpException(
  error: unknown,
  correlationId: string | undefined,
  timeoutMs: number,
  notFoundMessage?: string,
): HttpException {
  if (error instanceof TimeoutError) {
    Logger.error(`[${correlationId}] Timeout after ${timeoutMs}ms`);
    return new GatewayTimeoutException('Upstream service timed out');
  }

  if (!(error instanceof AxiosError)) {
    Logger.error(`[${correlationId}] Unexpected error: ${String(error)}`);
    return new BadGatewayException('Upstream request failed');
  }

  const url = error.config?.url ?? 'unknown';
  const status = error.response?.status;

  if (status === undefined) {
    Logger.error(`[${correlationId}] Unreachable: ${url} - ${error.message}`);
    return new ServiceUnavailableException('Upstream service is unavailable');
  }

  if (status === 404) {
    Logger.warn(`[${correlationId}] 404 Not Found: ${url}`);
    return new NotFoundException(notFoundMessage ?? 'Resource not found');
  }

  if (status < 500) {
    Logger.warn(`[${correlationId}] ${status} from ${url}`);
    const body = error.response?.data as string | Record<string, unknown>;
    return new HttpException(body ?? error.message, status);
  }

  Logger.error(`[${correlationId}] ${status} from ${url} - ${error.message}`);
  return new BadGatewayException('Upstream service error');
}
