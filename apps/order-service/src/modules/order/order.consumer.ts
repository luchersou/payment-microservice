import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { CreateOrderRequestedEvent } from '@contracts/events/create-order-requested.event';
import { OrderCancelRequestedEvent } from '@contracts/events/order-cancel-requested.event';
import { OrderCancelledEvent } from '@contracts/events/order-cancelled.event';
import { PaymentApprovedEvent } from '@contracts/events/payment-approved.event';
import { PaymentDeclinedEvent } from '@contracts/events/payment-declined.event';
import { PaymentFailedEvent } from '@contracts/events/payment-failed.event';
import { EventTypes } from '@contracts/types/event-types.enum';

import { OrderService } from './order.service';

type OrderEvents =
  | CreateOrderRequestedEvent
  | OrderCancelRequestedEvent
  | OrderCancelledEvent;
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
    await this.rabbit.consume<OrderEvents>(
      Queues.ORDER_PROCESS,
      async (event) => {
        switch (event.eventType) {
          case EventTypes.CREATE_ORDER_REQUESTED:
            this.logger.log(
              `📥 Received CreateOrderRequested: ${event.payload.userId}`,
            );
            await this.orderService.createOrder(event.payload);
            break;

          case EventTypes.ORDER_CANCEL_REQUESTED:
            this.logger.log(
              `📥 Received OrderCancelledRequested: ${event.payload.orderId}`,
            );
            await this.orderService.cancelByUser(event.payload.orderId);
            break;

          default:
            this.logger.warn(`⚠️ Unknown order event: ${event}`);
        }
      },
    );

    await this.rabbit.consume<PaymentEvents>(
      Queues.PAYMENT_RESULT,
      async (event) => {
        this.logger.log(
          `📥 Received ${event.eventType} for order ${event.payload.orderId}`,
        );

        switch (event.eventType) {
          case EventTypes.PAYMENT_APPROVED:
            await this.orderService.completeOrder(event.payload.orderId);
            break;

          case EventTypes.PAYMENT_DECLINED:
            await this.orderService.cancelByPaymentDeclined(
              event.payload.orderId,
            );
            break;

          case EventTypes.PAYMENT_FAILED:
            await this.orderService.failOrder(event.payload.orderId);
            break;

          default:
            this.logger.warn(`⚠️ Unknown payment event: ${event}`);
        }
      },
    );
  }
}
