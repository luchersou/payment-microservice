import { Channel, ConsumeMessage } from 'amqplib';

import { Exchanges } from '../constants';
import {
  createDelayedRequeueErrorHandler,
  createRetryErrorHandler,
  getDeadLetterReason,
  LAST_ERROR_HEADER,
  RETRY_COUNT_HEADER,
} from './retry-error-handler';

const makeChannel = () =>
  ({
    assertQueue: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockReturnValue(true),
    ack: jest.fn(),
    nack: jest.fn(),
  }) as unknown as jest.Mocked<Channel>;

const makeMessage = (headers: Record<string, unknown> = {}) =>
  ({
    content: Buffer.from('{"payload":{}}'),
    fields: { routingKey: 'order.created' },
    properties: {
      headers,
      correlationId: 'corr-1',
      contentType: 'application/json',
    },
  }) as unknown as ConsumeMessage;

describe('createRetryErrorHandler', () => {
  const handler = createRetryErrorHandler({
    queue: 'payment.order-created.queue',
    dlq: 'payment.order-created.dlq',
    maxRetries: 3,
    delayMs: 1000,
  });

  it('republishes to the retry queue and acks while under the limit', async () => {
    const channel = makeChannel();
    const msg = makeMessage({ [RETRY_COUNT_HEADER]: 1 });

    await handler(channel, msg, new Error('db down'));

    expect(channel.assertQueue).toHaveBeenCalledWith(
      'payment.order-created.queue.retry',
      {
        durable: true,
        arguments: {
          'x-message-ttl': 1000,
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': 'payment.order-created.queue',
        },
      },
    );
    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'payment.order-created.queue.retry',
      msg.content,
      expect.objectContaining({
        persistent: true,
        correlationId: 'corr-1',
        headers: expect.objectContaining({
          [RETRY_COUNT_HEADER]: 2,
          [LAST_ERROR_HEADER]: 'db down',
        }) as unknown,
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('starts counting from zero when the header is missing', async () => {
    const channel = makeChannel();

    await handler(channel, makeMessage(), new Error('boom'));

    const options = channel.publish.mock.calls[0][3];
    expect(options?.headers?.[RETRY_COUNT_HEADER]).toBe(1);
  });

  it('sends to the DLX once retries are exhausted', async () => {
    const channel = makeChannel();
    const msg = makeMessage({ [RETRY_COUNT_HEADER]: 3 });

    await handler(channel, msg, new Error('still failing'));

    expect(channel.assertQueue).not.toHaveBeenCalled();
    expect(channel.publish).toHaveBeenCalledWith(
      Exchanges.DLX,
      'payment.order-created.dlq',
      msg.content,
      expect.objectContaining({
        headers: expect.objectContaining({
          [LAST_ERROR_HEADER]: 'still failing',
        }) as unknown,
      }),
    );
    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('rejects without requeue when republishing fails', async () => {
    const channel = makeChannel();
    channel.publish.mockImplementation(() => {
      throw new Error('channel closed');
    });
    const msg = makeMessage();

    await handler(channel, msg, new Error('boom'));

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });
});

describe('createDelayedRequeueErrorHandler', () => {
  it('requeues the message after the delay', async () => {
    jest.useFakeTimers();
    const channel = makeChannel();
    const msg = makeMessage();

    const pending = createDelayedRequeueErrorHandler(500)(
      channel,
      msg,
      new Error('db down'),
    );

    expect(channel.nack).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    expect(channel.nack).toHaveBeenCalledWith(msg, false, true);
    jest.useRealTimers();
  });
});

describe('getDeadLetterReason', () => {
  it('prefers x-last-error over x-death', () => {
    const msg = makeMessage({
      [LAST_ERROR_HEADER]: 'db down',
      'x-death': [{ reason: 'rejected' }],
    });
    expect(getDeadLetterReason(msg)).toBe('db down');
  });

  it('falls back to the broker x-death reason', () => {
    const msg = makeMessage({ 'x-death': [{ reason: 'rejected' }] });
    expect(getDeadLetterReason(msg)).toBe('rejected');
  });
});
