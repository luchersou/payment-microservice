import { Injectable, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { OrderService } from './order.service';

@Injectable()
export class OrderConsumer implements OnModuleInit {
  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly orderService: OrderService,
  ) {}

  async onModuleInit() {
    await this.rabbit.consume(Queues.PAYMENT_RESULT, async (message) => {
      switch (message.type) {
        case RoutingKeys.PAYMENT_APPROVED:
          await this.orderService.completeOrder(message.orderId);
          break;

        case RoutingKeys.PAYMENT_DECLINED:
          await this.orderService.cancelOrder(message.orderId);
          break;

        default:
          console.log('⚠️ Unknown event type:', message.type);
      }
    });
  }
}

