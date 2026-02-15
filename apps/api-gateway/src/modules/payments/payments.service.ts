import { Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { makeHttpRequest } from '../../common/http-client.helper';

@Injectable()
export class PaymentsService {
  private readonly baseUrl: string;
  private readonly requestTimeout: number;

  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'PAYMENT_SERVICE_URL',
      'http://payment-service:3002',
    );
    this.requestTimeout = this.configService.get<number>('REQUEST_TIMEOUT', 5000);
  }

  async findAll(page: number, limit: number) {
  return makeHttpRequest(
    this.http.get(`${this.baseUrl}/payments`, {
      params: { page, limit },
    }),
    this.requestTimeout,
  );
}

async getPaymentStats() {
  return makeHttpRequest(
    this.http.get(`${this.baseUrl}/payments/stats`),
    this.requestTimeout,
  );
}

async findOne(id: string) {
  return makeHttpRequest(
    this.http.get(`${this.baseUrl}/payments/${id}`),
    this.requestTimeout,
    `Payment ${id} not found`,
  );
}

async findByOrderId(orderId: string) {
  return makeHttpRequest(
    this.http.get(`${this.baseUrl}/payments/order/${orderId}`),
    this.requestTimeout,
    `Payment for order ${orderId} not found`,
  );
}
}
