import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { correlationIdStorage } from '@common/context';
import { CorrelationLogger } from '@common/logger';

import { RawSqlDatabase } from '../database';
import { DLQ_SOURCE_QUEUE, DlqName } from '../rabbitmq/constants';
import { publishEvent } from '../rabbitmq/publishing';

export interface ReplayOptions {
  /** Maximum number of dead letters to replay in this run */
  limit: number;
  /** Only replay messages from this DLQ */
  queue?: string;
  publishTimeoutMs?: number;
}

export interface ReplayResult {
  replayed: number;
  /** Rows whose DLQ has no known source queue; left untouched */
  skipped: number;
  /** A publish failed and the run stopped early */
  failed: boolean;
}

interface DeadLetter {
  id: string;
  queue: string;
  payload: { correlationId?: string } & Record<string, unknown>;
}

const logger = new CorrelationLogger('DlqReplay');

/**
 * Republishes failed_messages rows not replayed yet, oldest first, and marks
 * each one replayedAt once the broker confirms it.
 *
 * A message goes back to the queue whose consumer gave up on it, through the
 * default exchange (routing key = queue name), instead of to its original
 * exchange and routing key: a topic exchange would also deliver it again to
 * every other queue bound to that key, whose consumers already handled it.
 * It arrives without retry headers, so it gets the full retry budget again,
 * and if it still fails it lands in the DLQ as a new row.
 *
 * Rows are claimed with FOR UPDATE SKIP LOCKED, so two runs never replay the
 * same row. Run it only after fixing what made the messages fail.
 */
export async function replayDeadLetters(
  db: RawSqlDatabase,
  amqp: AmqpConnection,
  { limit, queue, publishTimeoutMs = 5000 }: ReplayOptions,
): Promise<ReplayResult> {
  return db.$transaction(
    async (tx) => {
      const deadLetters = await tx.$queryRaw<DeadLetter[]>`
        SELECT id, queue, payload
        FROM failed_messages
        WHERE "replayedAt" IS NULL
          AND (${queue ?? null}::text IS NULL OR queue = ${queue ?? null})
        ORDER BY "createdAt"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;

      const result: ReplayResult = { replayed: 0, skipped: 0, failed: false };

      for (const deadLetter of deadLetters) {
        const target = DLQ_SOURCE_QUEUE[deadLetter.queue as DlqName];

        if (!target) {
          logger.warn(
            `⚠️ Unknown DLQ ${deadLetter.queue} for failed message ${deadLetter.id}, skipping`,
          );
          result.skipped++;
          continue;
        }

        try {
          await correlationIdStorage.run(
            { correlationId: deadLetter.payload.correlationId },
            () =>
              publishEvent(amqp, '', target, deadLetter.payload, {
                timeoutMs: publishTimeoutMs,
              }),
          );
        } catch (error) {
          // Stop, but commit what was already replayed so it is not sent twice
          logger.error(
            `❌ Could not replay failed message ${deadLetter.id}, stopping`,
            error instanceof Error ? error.stack : String(error),
          );
          result.failed = true;
          break;
        }

        await tx.$executeRaw`
          UPDATE failed_messages SET "replayedAt" = NOW()
          WHERE id = ${deadLetter.id}
        `;
        result.replayed++;
        logger.log(
          `🔁 Replayed failed message ${deadLetter.id} from ${deadLetter.queue} to ${target}`,
        );
      }

      return result;
    },
    { timeout: limit * publishTimeoutMs + 10_000 },
  );
}
