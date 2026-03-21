import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { CreateOrderRequestedEvent } from '@contracts/events/create-order-requested.event';
import { OrderCancelRequestedEvent } from '@contracts/events/order-cancel-requested.event';

import { makeHttpRequest } from '../../common/http-client.helper';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  private readonly orderServiceUrl: string;
  private readonly requestTimeout: number;

  constructor(
    private readonly rabbit: RabbitMQService,
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
    const event = new CreateOrderRequestedEvent({
      userId: createOrderDto.userId,
      total: createOrderDto.total,
    });

    await this.rabbit.publish(
      Exchanges.ORDERS,
      RoutingKeys.CREATE_ORDER_REQUESTED,
      event,
    );

    return {
      message: 'Order creation request accepted',
      status: 'PENDING',
    };
  }

  async cancelOrder(orderId: string) {
    const event = new OrderCancelRequestedEvent({
      orderId,
    });

    await this.rabbit.publish(
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
      this.http.get(`${this.orderServiceUrl}/orders`, {
        params: { page, limit },
      }),
      this.requestTimeout,
    );
  }

  async findOne(id: string) {
    return makeHttpRequest(
      this.http.get(`${this.orderServiceUrl}/orders/${id}`),
      this.requestTimeout,
      `Order ${id} not found`,
    );
  }
}
