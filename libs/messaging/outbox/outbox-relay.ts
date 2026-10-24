import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { correlationIdStorage } from '@common/context';
import { CorrelationLogger } from '@common/logger';

import { RawSqlDatabase, RawSqlTransaction } from '../database';
import { publishEvent } from '../rabbitmq/publishing';

export interface OutboxRelayOptions {
  batchSize: number;
  /** Per message; a broker that does not confirm in time ends the batch */
  publishTimeoutMs: number;
}

interface PendingMessage {
  id: string;
  exchange: string;
  routingKey: string;
  payload: Record<string, unknown>;
  correlationId: string | null;
}

/**
 * Publishes outbox rows that have not been published yet, oldest first.
 *
 * Rows are claimed with FOR UPDATE SKIP LOCKED inside a transaction, so
 * several instances can relay concurrently without publishing the same row
 * twice; the lock is released when the batch commits. A row is marked
 * published only after the broker confirms it. If the process dies between
 * the confirm and the commit, the row is published again: delivery is
 * at-least-once and consumers stay idempotent.
 */
export class OutboxRelay {
  private readonly logger = new CorrelationLogger(OutboxRelay.name);
  private running = false;

  constructor(
    private readonly db: RawSqlDatabase,
    private readonly amqp: AmqpConnection,
    private readonly options: OutboxRelayOptions,
  ) {}

  /** Returns how many messages were published; overlapping calls are no-ops */
  async relayPending(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      return await this.db.$transaction(
        (tx) => this.relayBatch(tx),
        // Enough for a full batch, plus one publish timing out
        { timeout: this.options.publishTimeoutMs * 2 + 10_000 },
      );
    } finally {
      this.running = false;
    }
  }

  private async relayBatch(tx: RawSqlTransaction): Promise<number> {
    const pending = await tx.$queryRaw<PendingMessage[]>`
      SELECT id, exchange, "routingKey", payload, "correlationId"
      FROM outbox_messages
      WHERE "publishedAt" IS NULL
      ORDER BY "createdAt"
      LIMIT ${this.options.batchSize}
      FOR UPDATE SKIP LOCKED
    `;

    let published = 0;

    for (const message of pending) {
      try {
        await correlationIdStorage.run(
          { correlationId: message.correlationId ?? undefined },
          () =>
            publishEvent(
              this.amqp,
              message.exchange,
              message.routingKey,
              message.payload,
              { timeoutMs: this.options.publishTimeoutMs },
            ),
        );
      } catch (error) {
        await tx.$executeRaw`
          UPDATE outbox_messages SET attempts = attempts + 1
          WHERE id = ${message.id}
        `;
        this.logger.warn(
          `📤 Outbox: could not publish ${message.routingKey} (${message.id}), retrying next poll — ${error instanceof Error ? error.message : String(error)}`,
        );
        // Keep the order: later messages wait for this one
        break;
      }

      await tx.$executeRaw`
        UPDATE outbox_messages
        SET "publishedAt" = NOW(), attempts = attempts + 1
        WHERE id = ${message.id}
      `;
      published++;
    }

    return published;
  }
}
