import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma/prisma.service';
import { RabbitMQService } from '@messaging/rabbitmq/rabbitmq.service';
import { RoutingKeys } from '@messaging/rabbitmq/constants/routing-keys.constant';
import { OrderCreatedEvent } from '@contracts/events/order-created.event';
import { PaymentApprovedEvent } from '@contracts/events/payment-approved.event';
import { PaymentDeclinedEvent } from '@contracts/events/payment-declined.event';
import { Exchanges } from '@messaging/rabbitmq/constants/exchanges.constant';
import { PaymentStatus } from '@database/prisma/generated/prisma/browser';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbit: RabbitMQService,
  ) {}

  async processPayment(event: OrderCreatedEvent) {
    const { orderId, amount } = event.payload;

    const existingPayment = await this.prisma.payment.findUnique({
      where: { orderId },
    });

    if (existingPayment) {
      console.log(`⚠️ Payment already processed for order ${orderId}, skipping...`);
      return; 
    }

    console.log('💳 Processing payment for order:', orderId);

    const approved = Math.random() > 0.3;

    const payment = await this.prisma.payment.create({
      data: {
        orderId,
        amount,
        status: approved
          ? PaymentStatus.APPROVED
          : PaymentStatus.FAILED,
      },
    });

    if (approved) {
      const event = new PaymentApprovedEvent({
        orderId,
        transactionId: payment.id,
      });

      await this.rabbit.publish(
        Exchanges.PAYMENTS,
        RoutingKeys.PAYMENT_APPROVED,
        event,
      );
    } else {
      const event = new PaymentDeclinedEvent({
        orderId,
        reason: 'Card declined',
      });

      await this.rabbit.publish(
        Exchanges.PAYMENTS,
        RoutingKeys.PAYMENT_DECLINED,
        event,
      );
    }

  }
}
