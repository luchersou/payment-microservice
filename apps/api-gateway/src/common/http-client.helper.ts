import { firstValueFrom, catchError, timeout, Observable, tap } from 'rxjs';
import { AxiosResponse } from 'axios';
import { NotFoundException, RequestTimeoutException, Logger } from '@nestjs/common';

export async function makeHttpRequest<T>(
  observable: Observable<AxiosResponse<T>>,
  timeoutMs: number,
  notFoundMessage?: string,
): Promise<T> {
  try {
    const response = await firstValueFrom(
      observable.pipe(
        tap((response) => {
          Logger.log(`${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        }),
        timeout(timeoutMs),
        catchError((error) => {
          const url = error.config?.url || 'unknown';
          
          if (error.response?.status === 404 && notFoundMessage) {
            Logger.warn(`404 Not Found: ${url}`);
            throw new NotFoundException(notFoundMessage);
          }
          
          if (error.name === 'TimeoutError') {
            Logger.error(`Timeout: ${url} (${timeoutMs}ms)`);
            throw new RequestTimeoutException('Service is unavailable');
          }
          
          Logger.error(`HTTP Error: ${url} - ${error.message}`);
          throw new RequestTimeoutException('Service is unavailable');
        }),
      ),
    );
    
    return response.data;
  } catch (error) {
    if (
      error instanceof NotFoundException ||
      error instanceof RequestTimeoutException
    ) {
      throw error;
    }
    throw new Error('Request failed');
  }
}