import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { correlationIdStorage } from '@common/context';
import { Exchanges, RoutingKeys } from '@messaging/rabbitmq';

import { OrdersService } from './orders.service';

describe('OrdersService (gateway)', () => {
  let amqp: { publish: jest.Mock };
  let service: OrdersService;

  beforeEach(() => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };
    service = new OrdersService(
      amqp as unknown as AmqpConnection,
      {} as HttpService,
      new ConfigService({}),
    );
  });

  const inRequest = <T>(fn: () => Promise<T>) =>
    correlationIdStorage.run({ correlationId: 'req-1' }, fn);

  const publishedEvent = () =>
    amqp.publish.mock.calls[0][2] as {
      correlationId?: string;
      payload: Record<string, unknown>;
    };

  describe('cancelOrder', () => {
    it('carries the request correlationId in the event body and properties', async () => {
      await inRequest(() => service.cancelOrder('order-1'));

      expect(amqp.publish).toHaveBeenCalledWith(
        Exchanges.ORDERS,
        RoutingKeys.ORDER_CANCEL_REQUESTED,
        expect.anything(),
        expect.objectContaining({ correlationId: 'req-1', persistent: true }),
      );
      expect(publishedEvent()).toMatchObject({
        correlationId: 'req-1',
        payload: { orderId: 'order-1' },
      });
    });
  });
});
