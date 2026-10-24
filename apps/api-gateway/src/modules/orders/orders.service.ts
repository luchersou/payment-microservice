import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { randomUUID } from 'crypto';

import { CorrelationIdService } from '@common/context';
import { Exchanges, publishEvent, RoutingKeys } from '@messaging/rabbitmq';
import {
  CreateOrderRequestedEvent,
  OrderCancelRequestedEvent,
} from '@contracts/order-events';

import { makeHttpRequest } from '../../common/http';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly orderServiceUrl: string;
  private readonly requestTimeout: number;

  constructor(
    private readonly AmqpConnection: AmqpConnection,
    private readonly http: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.orderServiceUrl = this.configService.get<string>(
      'ORDER_SERVICE_URL',
      'http://localhost:3001',
    );
    this.requestTimeout = this.configService.get<number>(
      'REQUEST_TIMEOUT',
      5000,
    );
  }

  async createOrder(createOrderDto: CreateOrderDto) {
    const orderId = randomUUID();
    const correlationId = CorrelationIdService.getId();

    const event = new CreateOrderRequestedEvent(
      {
        orderId,
        userId: createOrderDto.userId,
        totalCents: createOrderDto.totalCents,
      },
      correlationId,
    );

    await publishEvent(
      this.AmqpConnection,
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CREATE_REQUESTED,
      event,
    );

    return {
      orderId,
      message: 'Order creation request accepted',
      status: 'PENDING',
    };
  }

  async cancelOrder(orderId: string) {
    const event = new OrderCancelRequestedEvent(
      { orderId },
      CorrelationIdService.getId(),
    );

    await publishEvent(
      this.AmqpConnection,
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CANCEL_REQUESTED,
      event,
    );

    return {
      orderId,
      message: 'Order cancellation request accepted',
    };
  }

  async findAll(page: number, limit: number) {
    return makeHttpRequest(
      this.http.get<unknown>(`${this.orderServiceUrl}/orders`, {
        params: { page, limit },
      }),
      this.requestTimeout,
    );
  }

  async findOne(id: string) {
    return makeHttpRequest(
      this.http.get<unknown>(`${this.orderServiceUrl}/orders/${id}`),
      this.requestTimeout,
      `Order ${id} not found`,
    );
  }
}
