import { Injectable} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { CreateOrderDto } from './dto/create-order.dto';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { EventTypes } from '@contracts/types/event-types.enum';
import { v4 as uuidv4 } from 'uuid';
import { makeHttpRequest } from '../../common/http-client.helper';
import { ConfigService } from '@nestjs/config';

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
    this.requestTimeout = this.configService.get<number>('REQUEST_TIMEOUT', 5000);
  }

  async createOrder(createOrderDto: CreateOrderDto) {
    const orderId = uuidv4();
    
    await this.rabbit.publish(
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CREATED,
      {
        eventType: EventTypes.ORDER_CREATED,
        payload: {
          orderId,
          userId: createOrderDto.userId,
          total: createOrderDto.total,
        },
      }
    );

    return {
      orderId,
      message: 'Order creation request accepted',
      status: 'PENDING_PAYMENT',
    };
  }

  async cancelOrder(orderId: string) {
    await this.rabbit.publish(
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CANCELLED,
      {
        eventType: EventTypes.ORDER_CANCELLED,
        payload: { orderId },
      },
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