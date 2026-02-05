import { Injectable, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { PaymentService } from './payment.service';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';

@Injectable()
export class PaymentConsumer implements OnModuleInit {
  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly paymentService: PaymentService,
  ) {}

  async onModuleInit() {
    await this.rabbit.consume<OrderCreatedEvent>(
      Exchanges.ORDERS,
      Queues.PAYMENT_PROCESS,
      RoutingKeys.ORDER_CREATED,
      async (event) => {
        await this.paymentService.processPayment(event);
      },
    );
  }
}
