import { ConsumeMessage } from 'amqplib';

import {
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
} from '@contracts/payment-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { OrderService } from '../services/order.service';
import { OrderConsumer } from './order.consumer';

jest.mock('@order/prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('OrderConsumer.handlePaymentEvents', () => {
  let orderService: {
    completeOrder: jest.Mock;
    failOrder: jest.Mock;
    cancelByUser: jest.Mock;
  };
  let consumer: OrderConsumer;

  const amqpMsg = { properties: {} } as unknown as ConsumeMessage;

  beforeEach(() => {
    orderService = {
      completeOrder: jest.fn(),
      failOrder: jest.fn(),
      cancelByUser: jest.fn(),
    };
    consumer = new OrderConsumer(
      orderService as unknown as OrderService,
      {
        startMessageProcessingTimer: jest.fn(() => jest.fn()),
      } as unknown as OrderMetricsService,
    );
  });

  it('completes the order on PaymentApproved', async () => {
    await consumer.handlePaymentEvents(
      new PaymentApprovedEvent({ orderId: 'o', transactionId: 't' }),
      amqpMsg,
    );

    expect(orderService.completeOrder).toHaveBeenCalledWith('o');
  });

  it('fails the order on PaymentDeclined instead of cancelling it', async () => {
    await consumer.handlePaymentEvents(
      new PaymentDeclinedEvent({ orderId: 'o', reason: 'No funds' }),
      amqpMsg,
    );

    expect(orderService.failOrder).toHaveBeenCalledWith('o');
    expect(orderService.cancelByUser).not.toHaveBeenCalled();
  });

  it('fails the order on PaymentFailed', async () => {
    await consumer.handlePaymentEvents(
      new PaymentFailedEvent({ orderId: 'o', error: 'timeout' }),
      amqpMsg,
    );

    expect(orderService.failOrder).toHaveBeenCalledWith('o');
  });
});
