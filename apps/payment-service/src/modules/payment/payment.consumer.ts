import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { OrderCancelledEvent } from '@contracts/events/order-cancelled.event';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { EventTypes } from '@contracts/types/event-types.enum';

import { PaymentService } from './payment.service';

type OrderDomainEvents = OrderCreatedEvent | OrderCancelledEvent;

@Injectable()
export class PaymentConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly paymentService: PaymentService,
  ) {}

  async onModuleInit() {
    await this.rabbit.consume<OrderDomainEvents>(
      Queues.PAYMENT_PROCESS,
      async (event) => {
        switch (event.eventType) {
          case EventTypes.ORDER_CREATED:
            this.logger.log(
              `📥 Received OrderCreated: ${event.payload.orderId}`,
            );
            await this.paymentService.handleOrderCreated(event.payload);
            break;

          case EventTypes.ORDER_CANCELLED:
            this.logger.log(
              `📥 Received OrderCancelled: ${event.payload.orderId}`,
            );
            await this.paymentService.handleOrderCancelled(event.payload);
            break;

          default:
            this.logger.warn(`⚠️ Unknown event type: ${event}`);
        }
      },
    );
  }
}
