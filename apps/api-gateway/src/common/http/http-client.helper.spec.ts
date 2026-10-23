import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { NEVER, of, throwError } from 'rxjs';

import { makeHttpRequest } from './http-client.helper';

const config = {
  url: 'http://order-service/orders/1',
  headers: new AxiosHeaders(),
};

function axiosError(status?: number, data?: unknown) {
  const response = status
    ? ({ status, data, config, headers: {}, statusText: '' } as AxiosResponse)
    : undefined;
  return new AxiosError('request failed', 'ERR', config, undefined, response);
}

describe('makeHttpRequest', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('returns the response data', async () => {
    const response = {
      data: { id: 1 },
      status: 200,
      config,
    } as AxiosResponse<{ id: number }>;

    await expect(makeHttpRequest(of(response), 1000)).resolves.toEqual({
      id: 1,
    });
  });

  it('maps a downstream 404 to NotFound with the custom message', async () => {
    await expect(
      makeHttpRequest(
        throwError(() => axiosError(404)),
        1000,
        'Order 1 not found',
      ),
    ).rejects.toEqual(new NotFoundException('Order 1 not found'));
  });

  it('passes other downstream 4xx through', async () => {
    const error = await makeHttpRequest(
      throwError(() => axiosError(400, { message: 'bad id' })),
      1000,
    ).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(
      HttpStatus.BAD_REQUEST,
    );
    expect((error as BadRequestException).getResponse()).toEqual({
      message: 'bad id',
    });
  });

  it('maps a downstream 5xx to 502', async () => {
    await expect(
      makeHttpRequest(
        throwError(() => axiosError(500)),
        1000,
      ),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('maps an unreachable service to 503', async () => {
    await expect(
      makeHttpRequest(
        throwError(() => axiosError()),
        1000,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('maps a timeout to 504', async () => {
    await expect(makeHttpRequest(NEVER, 10)).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });
});
