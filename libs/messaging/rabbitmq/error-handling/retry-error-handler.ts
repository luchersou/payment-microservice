import { Logger } from '@nestjs/common';

import { MessageErrorHandler } from '@golevelup/nestjs-rabbitmq';
import {
  Channel,
  ConfirmChannel,
  ConsumeMessage,
  MessagePropertyHeaders,
} from 'amqplib';
import { Counter, register } from 'prom-client';

import { Exchanges } from '../constants';

export const RETRY_COUNT_HEADER = 'x-retry-count';
export const LAST_ERROR_HEADER = 'x-last-error';

export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_DELAY_MS = 5000;

export interface RetryPolicy {
  /** Queue the consumer reads from */
  queue: string;
  /** DLQ routing key (bound on the DLX) that receives exhausted messages */
  dlq: string;
  maxRetries?: number;
  delayMs?: number;
}

export const retryQueueName = (queue: string) => `${queue}.retry`;

const RETRIES_METRIC = 'rabbitmq_message_failures_total';

/**
 * Failed message handling outcomes per queue: `retry` (scheduled for
 * redelivery) or `dead_letter` (retries exhausted, sent to the DLQ).
 * Registered on the default registry, which every service exposes.
 */
function failuresCounter(): Counter<'queue' | 'outcome'> {
  return (
    (register.getSingleMetric(RETRIES_METRIC) as
      | Counter<'queue' | 'outcome'>
      | undefined) ??
    new Counter({
      name: RETRIES_METRIC,
      help: 'Failed RabbitMQ messages by queue and outcome (retry, dead_letter)',
      labelNames: ['queue', 'outcome'],
    })
  );
}

/**
 * Error handler with bounded, delayed retries.
 *
 * - While `x-retry-count < maxRetries`: the message is republished to
 *   `<queue>.retry`, a queue with a TTL whose dead-letter target is the
 *   original queue (via the default exchange). After `delayMs` it comes back.
 * - Once retries are exhausted: the message is published to the DLX with the
 *   DLQ routing key and the last error in the `x-last-error` header.
 *
 * The original message is only acked after the broker confirms the
 * republish; until then the copy may still be lost. If the republish throws
 * or is not confirmed, the message is rejected without requeue so the
 * queue's own `x-dead-letter-exchange` still routes it to the DLQ.
 */
export function createRetryErrorHandler({
  queue,
  dlq,
  maxRetries = DEFAULT_MAX_RETRIES,
  delayMs = DEFAULT_RETRY_DELAY_MS,
}: RetryPolicy): MessageErrorHandler {
  const logger = new Logger('RetryErrorHandler');
  const retryQueue = retryQueueName(queue);

  return async (channel: Channel, msg: ConsumeMessage, error: unknown) => {
    const headers: MessagePropertyHeaders = msg.properties.headers ?? {};
    const attempt = Number(headers[RETRY_COUNT_HEADER] ?? 0);
    const reason = error instanceof Error ? error.message : String(error);
    const correlationId = msg.properties.correlationId as string | undefined;

    try {
      if (attempt < maxRetries) {
        await channel.assertQueue(retryQueue, {
          durable: true,
          arguments: {
            'x-message-ttl': delayMs,
            'x-dead-letter-exchange': '',
            'x-dead-letter-routing-key': queue,
          },
        });

        await republish(channel, msg, '', retryQueue, {
          ...headers,
          [RETRY_COUNT_HEADER]: attempt + 1,
          [LAST_ERROR_HEADER]: reason,
        });

        failuresCounter().inc({ queue, outcome: 'retry' });
        logger.warn(
          `[${correlationId}] 🔁 ${queue}: retry ${attempt + 1}/${maxRetries} in ${delayMs}ms — ${reason}`,
        );
      } else {
        await republish(channel, msg, Exchanges.DLX, dlq, {
          ...headers,
          [LAST_ERROR_HEADER]: reason,
        });

        failuresCounter().inc({ queue, outcome: 'dead_letter' });
        logger.error(
          `[${correlationId}] ☠️ ${queue}: retries exhausted (${maxRetries}), sent to ${dlq} — ${reason}`,
        );
      }
    } catch (republishError) {
      logger.error(
        `[${correlationId}] ❌ ${queue}: could not republish failed message, rejecting to DLX`,
        republishError instanceof Error
          ? republishError.stack
          : String(republishError),
      );
      settle(logger, () => channel.nack(msg, false, false));
      return;
    }

    // Only now is the copy safe on the broker
    settle(logger, () => channel.ack(msg));
  };
}

const isConfirmChannel = (channel: Channel): channel is ConfirmChannel =>
  typeof (channel as Partial<ConfirmChannel>).waitForConfirms === 'function';

/** Resolves once the broker confirms the message, rejects if it nacks it */
function republish(
  channel: Channel,
  msg: ConsumeMessage,
  exchange: string,
  routingKey: string,
  headers: MessagePropertyHeaders,
): Promise<void> {
  const { properties } = msg;

  return new Promise((resolve, reject) => {
    // Without publisher confirms there is no way to know the copy arrived
    if (!isConfirmChannel(channel)) {
      reject(new Error('Channel is not in confirm mode'));
      return;
    }

    channel.publish(
      exchange,
      routingKey,
      msg.content,
      {
        headers,
        persistent: true,
        contentType: properties.contentType as string | undefined,
        contentEncoding: properties.contentEncoding as string | undefined,
        correlationId: properties.correlationId as string | undefined,
        messageId: properties.messageId as string | undefined,
        timestamp: properties.timestamp as number | undefined,
        type: properties.type as string | undefined,
        appId: properties.appId as string | undefined,
      },
      (err) => (err ? reject(err as Error) : resolve()),
    );
  });
}

/**
 * ack/nack throw once the channel is closed (e.g. broker restart). The broker
 * then redelivers every unacked message itself, so there is nothing to do,
 * and letting the error escape would crash the process (unhandled rejection).
 */
function settle(logger: Logger, action: () => void) {
  try {
    action();
  } catch (error) {
    logger.warn(
      `⚠️ Could not settle message, the broker will redeliver it — ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Error handler for DLQ consumers: if persisting the dead letter fails
 * (e.g. database down), requeue after a delay instead of dropping it.
 */
export function createDelayedRequeueErrorHandler(
  delayMs = DEFAULT_RETRY_DELAY_MS,
): MessageErrorHandler {
  const logger = new Logger('DlqErrorHandler');

  return async (channel: Channel, msg: ConsumeMessage, error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(
      `❌ Failed to handle dead letter, requeueing in ${delayMs}ms — ${reason}`,
    );

    await new Promise((resolve) => setTimeout(resolve, delayMs));
    settle(logger, () => channel.nack(msg, false, true));
  };
}

/** Reason to store for a dead letter: our header first, broker x-death second */
export function getDeadLetterReason(msg: ConsumeMessage): string | undefined {
  const headers = msg.properties.headers ?? {};
  const lastError = headers[LAST_ERROR_HEADER] as string | undefined;
  const xDeath = headers['x-death'] as Array<{ reason?: string }> | undefined;

  return lastError ?? xDeath?.[0]?.reason;
}
