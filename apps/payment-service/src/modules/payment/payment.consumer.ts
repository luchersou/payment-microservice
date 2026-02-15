import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { Queues } from '@messaging/rabbitmq/constants/queues.constant';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { PaymentService } from './payment.service';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { OrderCancelledEvent } from '@contracts/events/order-cancelled.event';
import { EventTypes } from '@contracts/types/event-types.enum';

type OrderEvents = OrderCreatedEvent | OrderCancelledEvent;

@Injectable()
export class PaymentConsumer implements OnModuleInit {
  private readonly logger = new Logger(PaymentConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly paymentService: PaymentService,
  ) {}

  async onModuleInit() {
    await this.rabbit.consume<OrderEvents>(
      Queues.PAYMENT_PROCESS,
      Exchanges.ORDERS,
      'order.*',
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
        }
      },
    );
  }
}
