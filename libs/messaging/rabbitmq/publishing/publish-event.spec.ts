import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { correlationIdStorage } from '@common/context';
import { BaseEvent } from '@common/events';

import { publishEvent } from './publish-event';

class TestEvent extends BaseEvent<{ id: string }> {
  readonly eventType = 'Test';
}

describe('publishEvent', () => {
  let amqp: { publish: jest.Mock };

  beforeEach(() => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };
  });

  const publish = (event: TestEvent) =>
    publishEvent(amqp as unknown as AmqpConnection, 'ex', 'rk', event);

  it('always publishes persistent messages', async () => {
    const event = new TestEvent({ id: '1' });

    await publish(event);

    expect(amqp.publish).toHaveBeenCalledWith(
      'ex',
      'rk',
      event,
      expect.objectContaining({ persistent: true }),
    );
  });

  it('uses the correlationId from the async context', async () => {
    await correlationIdStorage.run({ correlationId: 'ctx-id' }, () =>
      publish(new TestEvent({ id: '1' }, 'body-id')),
    );

    expect(amqp.publish.mock.calls[0][3]).toEqual({
      persistent: true,
      correlationId: 'ctx-id',
    });
  });

  it('falls back to the correlationId in the event body', async () => {
    await publish(new TestEvent({ id: '1' }, 'body-id'));

    expect(amqp.publish.mock.calls[0][3]).toEqual({
      persistent: true,
      correlationId: 'body-id',
    });
  });
});
