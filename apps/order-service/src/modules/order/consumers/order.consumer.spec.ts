import { ConsumeMessage } from 'amqplib';

import {
  PaymentApprovedEvent,
  PaymentDeclinedEvent,
  PaymentFailedEvent,
} from '@contracts/payment-events';

import { OrderMetricsService } from '../../metrics/metrics.service';
import { ApplyPaymentResultUseCase } from '../application/apply-payment-result.use-case';
import { CancelOrderUseCase } from '../application/cancel-order.use-case';
import { CreateOrderUseCase } from '../application/create-order.use-case';
import { OrderConsumer } from './order.consumer';

jest.mock('@order/prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('OrderConsumer.handlePaymentEvents', () => {
  let applyPaymentResult: { execute: jest.Mock };
  let cancelOrder: { execute: jest.Mock };
  let consumer: OrderConsumer;

  const amqpMsg = { properties: {} } as unknown as ConsumeMessage;

  beforeEach(() => {
    applyPaymentResult = { execute: jest.fn() };
    cancelOrder = { execute: jest.fn() };
    consumer = new OrderConsumer(
      { execute: jest.fn() } as unknown as CreateOrderUseCase,
      cancelOrder as unknown as CancelOrderUseCase,
      applyPaymentResult as unknown as ApplyPaymentResultUseCase,
      {
        startMessageProcessingTimer: jest.fn(() => jest.fn()),
      } as unknown as OrderMetricsService,
    );
  });

  it('applies an approved result on PaymentApproved', async () => {
    await consumer.handlePaymentEvents(
      new PaymentApprovedEvent({ orderId: 'o', transactionId: 't' }),
      amqpMsg,
    );

    expect(applyPaymentResult.execute).toHaveBeenCalledWith('o', 'approved');
  });

  it('applies a declined result on PaymentDeclined instead of cancelling', async () => {
    await consumer.handlePaymentEvents(
      new PaymentDeclinedEvent({ orderId: 'o', reason: 'No funds' }),
      amqpMsg,
    );

    expect(applyPaymentResult.execute).toHaveBeenCalledWith('o', 'declined');
    expect(cancelOrder.execute).not.toHaveBeenCalled();
  });

  it('applies a failed result on PaymentFailed', async () => {
    await consumer.handlePaymentEvents(
      new PaymentFailedEvent({ orderId: 'o', error: 'timeout' }),
      amqpMsg,
    );

    expect(applyPaymentResult.execute).toHaveBeenCalledWith('o', 'failed');
  });
});
