import { HttpService } from '@nestjs/axios';
import { Logger } from '@nestjs/common';
import { CorrelationIdService } from '@common/context';

export function setupAxiosInterceptors(httpService: HttpService) {
  const axios = httpService.axiosRef;

  axios.interceptors.request.use((config) => {
    const correlationId = CorrelationIdService.getId();

    if (correlationId) {
      config.headers = config.headers || {};
      config.headers['x-correlation-id'] = correlationId;
    }

    return config;
  });

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const correlationId = CorrelationIdService.getId();

      Logger.error(
        `[${correlationId}] Axios Error: ${error.config?.url} - ${error.message}`,
      );

      return Promise.reject(error);
    },
  );
}
