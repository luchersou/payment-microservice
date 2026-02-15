import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { OrderService } from './order.service';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { PaymentDeclinedEvent } from '@contracts/events/payment-declined.event';
import { PaymentApprovedEvent } from '@contracts/events/payment-approved.event';
import { PaymentFailedEvent } from '@contracts/events/payment-failed.event';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { EventTypes } from '@contracts/types/event-types.enum';

type PaymentEvents =
  | PaymentApprovedEvent
  | PaymentDeclinedEvent
  | PaymentFailedEvent;

@Injectable()
export class OrderConsumer implements OnModuleInit {
  private readonly logger = new Logger(OrderConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly orderService: OrderService,
  ) {}

  async onModuleInit() {
    await this.rabbit.consume<OrderCreatedEvent>(
      Queues.ORDER_PROCESS,
      Exchanges.ORDERS,
      RoutingKeys.ORDER_CREATED,
      async (event) => {
        this.logger.log(
          `📥 Received OrderCreated: ${event.payload.orderId}`,
        );
        await this.orderService.createOrder(event.payload);
      },
    );

    await this.rabbit.consume<PaymentEvents>(
      Queues.PAYMENT_RESULT,
      Exchanges.PAYMENTS,
      RoutingKeys.PAYMENT_ALL,
      async (event) => {
        this.logger.log(
          `📥 Received ${event.eventType} for order ${event.payload.orderId}`,
        );

        switch (event.eventType) {
          case EventTypes.PAYMENT_APPROVED:
            await this.orderService.completeOrder(event.payload.orderId);
            break;

          case EventTypes.PAYMENT_DECLINED:
            await this.orderService.cancelByPaymentDeclined(event.payload.orderId);
            break;

          case EventTypes.PAYMENT_FAILED:
            await this.orderService.failOrder(event.payload.orderId);
            break;

          default:
            this.logger.warn(`⚠️ Unknown event type: ${event}`);
        }
      },
    );
  }
}
