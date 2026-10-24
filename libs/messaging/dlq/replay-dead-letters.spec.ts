import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { RawSqlDatabase, RawSqlTransaction } from '../database';
import { DLQ, DLQ_SOURCE_QUEUE, Queues } from '../rabbitmq/constants';
import { replayDeadLetters } from './replay-dead-letters';

type Row = {
  id: string;
  queue: string;
  payload: Record<string, unknown>;
};

const row = (id: string, queue: string = DLQ.PAYMENT_ORDER_CREATED): Row => ({
  id,
  queue,
  payload: { eventId: id, correlationId: `corr-${id}`, payload: {} },
});

function makeDb(rows: Row[]) {
  const queries: { sql: string; values: unknown[] }[] = [];
  const replayedIds: unknown[] = [];

  const tx = {
    $queryRaw: jest.fn((sql: TemplateStringsArray, ...values: unknown[]) => {
      queries.push({ sql: sql.join('?'), values });
      return Promise.resolve(rows);
    }),
    $executeRaw: jest.fn((_sql: TemplateStringsArray, ...values: unknown[]) => {
      replayedIds.push(values[0]);
      return Promise.resolve(1);
    }),
  };

  const db: RawSqlDatabase = {
    $transaction: jest.fn((fn) => fn(tx as unknown as RawSqlTransaction)),
  };

  return { db, queries, replayedIds };
}

describe('replayDeadLetters', () => {
  let amqp: { publish: jest.Mock };

  beforeEach(() => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };
  });

  const replay = (db: RawSqlDatabase, queue?: string) =>
    replayDeadLetters(db, amqp as unknown as AmqpConnection, {
      limit: 10,
      queue,
      publishTimeoutMs: 1000,
    });

  it('claims rows not replayed yet with FOR UPDATE SKIP LOCKED', async () => {
    const { db, queries } = makeDb([]);

    await replay(db, DLQ.ORDER_CREATE);

    expect(queries[0].sql).toMatch(/"replayedAt" IS NULL/);
    expect(queries[0].sql).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(queries[0].values).toEqual([DLQ.ORDER_CREATE, DLQ.ORDER_CREATE, 10]);
  });

  it('republishes to the source queue through the default exchange and marks it', async () => {
    const { db, replayedIds } = makeDb([row('a')]);

    await expect(replay(db)).resolves.toEqual({
      replayed: 1,
      skipped: 0,
      failed: false,
    });

    expect(amqp.publish).toHaveBeenCalledWith(
      '',
      Queues.PAYMENT_ORDER_CREATED,
      row('a').payload,
      { persistent: true, correlationId: 'corr-a', timeout: 1000 },
    );
    expect(replayedIds).toEqual(['a']);
  });

  it('skips rows from an unknown DLQ', async () => {
    const { db, replayedIds } = makeDb([row('a', 'mystery.dlq'), row('b')]);

    await expect(replay(db)).resolves.toMatchObject({
      replayed: 1,
      skipped: 1,
    });
    expect(replayedIds).toEqual(['b']);
  });

  it('stops on a publish error and keeps what was already replayed', async () => {
    amqp.publish
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('timeout'));
    const { db, replayedIds } = makeDb([row('a'), row('b'), row('c')]);

    await expect(replay(db)).resolves.toEqual({
      replayed: 1,
      skipped: 0,
      failed: true,
    });
    expect(replayedIds).toEqual(['a']);
  });
});

describe('DLQ_SOURCE_QUEUE', () => {
  it('maps every DLQ to a consumer queue', () => {
    for (const dlq of Object.values(DLQ)) {
      expect(Object.values(Queues)).toContain(DLQ_SOURCE_QUEUE[dlq]);
    }
  });
});
