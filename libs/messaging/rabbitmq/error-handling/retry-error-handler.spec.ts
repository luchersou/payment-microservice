import { ConfirmChannel, ConsumeMessage } from 'amqplib';

import { Exchanges } from '../constants';
import {
  createDelayedRequeueErrorHandler,
  createRetryErrorHandler,
  getDeadLetterReason,
  LAST_ERROR_HEADER,
  RETRY_COUNT_HEADER,
} from './retry-error-handler';

type ConfirmCallback = (err: unknown) => void;

/** Confirm channel whose broker confirms every publish right away */
const makeChannel = () =>
  ({
    assertQueue: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn(
      (
        _exchange: string,
        _routingKey: string,
        _content: Buffer,
        _options: unknown,
        confirm: ConfirmCallback,
      ) => {
        confirm(null);
        return true;
      },
    ),
    waitForConfirms: jest.fn().mockResolvedValue(undefined),
    ack: jest.fn(),
    nack: jest.fn(),
  }) as unknown as jest.Mocked<ConfirmChannel>;

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
      expect.any(Function),
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
      expect.any(Function),
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

  it('only acks after the broker confirms the republish', async () => {
    const channel = makeChannel();
    let confirm!: ConfirmCallback;
    channel.publish.mockImplementation((...args: unknown[]) => {
      confirm = args[4] as ConfirmCallback;
      return true;
    });
    const msg = makeMessage();

    const pending = handler(channel, msg, new Error('boom'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(channel.ack).not.toHaveBeenCalled();

    confirm(null);
    await pending;

    expect(channel.ack).toHaveBeenCalledWith(msg);
  });

  it('rejects without requeue when the broker nacks the republish', async () => {
    const channel = makeChannel();
    channel.publish.mockImplementation((...args: unknown[]) => {
      (args[4] as ConfirmCallback)(new Error('nacked'));
      return true;
    });
    const msg = makeMessage();

    await handler(channel, msg, new Error('boom'));

    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it('rejects without requeue on a channel without publisher confirms', async () => {
    const channel = makeChannel();
    delete (channel as Partial<ConfirmChannel>).waitForConfirms;
    const msg = makeMessage();

    await handler(channel, msg, new Error('boom'));

    expect(channel.publish).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
  });

  it('does not throw when the channel closed under it', async () => {
    const channel = makeChannel();
    channel.assertQueue.mockRejectedValue(new Error('Channel closed'));
    channel.nack.mockImplementation(() => {
      throw new Error('Channel closed');
    });

    await expect(
      handler(channel, makeMessage(), new Error('boom')),
    ).resolves.toBeUndefined();
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

  it('does not throw when the channel closed during the delay', async () => {
    const channel = makeChannel();
    channel.nack.mockImplementation(() => {
      throw new Error('Channel closed');
    });

    await expect(
      createDelayedRequeueErrorHandler(0)(
        channel,
        makeMessage(),
        new Error('db down'),
      ),
    ).resolves.toBeUndefined();
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
