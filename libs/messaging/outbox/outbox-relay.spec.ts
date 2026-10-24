import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { OutboxDatabase, OutboxRelay, OutboxTransaction } from './outbox-relay';

type Row = {
  id: string;
  exchange: string;
  routingKey: string;
  payload: Record<string, unknown>;
  correlationId: string | null;
};

const row = (id: string, correlationId: string | null = `corr-${id}`): Row => ({
  id,
  exchange: 'orders.exchange',
  routingKey: 'order.created',
  payload: { eventId: id, payload: { orderId: id } },
  correlationId,
});

function makeDb(rows: Row[]) {
  const queries: string[] = [];
  const executed: { sql: string; id: unknown }[] = [];

  const tx = {
    $queryRaw: jest.fn((sql: TemplateStringsArray) => {
      queries.push(sql.join('?'));
      return Promise.resolve(rows);
    }),
    $executeRaw: jest.fn((sql: TemplateStringsArray, ...values: unknown[]) => {
      executed.push({ sql: sql.join('?'), id: values[0] });
      return Promise.resolve(1);
    }),
  };

  const db: OutboxDatabase = {
    $transaction: jest.fn((fn) => fn(tx as unknown as OutboxTransaction)),
  };

  const publishedIds = () =>
    executed.filter((e) => e.sql.includes('"publishedAt"')).map((e) => e.id);
  const failedIds = () =>
    executed.filter((e) => !e.sql.includes('"publishedAt"')).map((e) => e.id);

  return { db, queries, publishedIds, failedIds };
}

describe('OutboxRelay', () => {
  let amqp: { publish: jest.Mock };

  beforeEach(() => {
    amqp = { publish: jest.fn().mockResolvedValue(true) };
  });

  const relayFor = (db: OutboxDatabase) =>
    new OutboxRelay(db, amqp as unknown as AmqpConnection, {
      batchSize: 50,
      publishTimeoutMs: 1000,
    });

  it('claims unpublished rows with FOR UPDATE SKIP LOCKED, oldest first', async () => {
    const { db, queries } = makeDb([]);

    await relayFor(db).relayPending();

    expect(queries[0]).toMatch(/WHERE "publishedAt" IS NULL/);
    expect(queries[0]).toMatch(/ORDER BY "createdAt"/);
    expect(queries[0]).toMatch(/FOR UPDATE SKIP LOCKED/);
  });

  it('publishes each row persistently and marks it published', async () => {
    const { db, publishedIds } = makeDb([row('a'), row('b')]);

    await expect(relayFor(db).relayPending()).resolves.toBe(2);

    expect(amqp.publish).toHaveBeenNthCalledWith(
      1,
      'orders.exchange',
      'order.created',
      row('a').payload,
      { persistent: true, correlationId: 'corr-a', timeout: 1000 },
    );
    expect(publishedIds()).toEqual(['a', 'b']);
  });

  it('stops at the first failed publish, counting the attempt, to keep the order', async () => {
    amqp.publish
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('timeout'));
    const { db, publishedIds, failedIds } = makeDb([
      row('a'),
      row('b'),
      row('c'),
    ]);

    await expect(relayFor(db).relayPending()).resolves.toBe(1);

    expect(amqp.publish).toHaveBeenCalledTimes(2);
    expect(publishedIds()).toEqual(['a']);
    expect(failedIds()).toEqual(['b']);
  });

  it('falls back to the correlationId in the event body', async () => {
    const message = {
      ...row('a', null),
      payload: { correlationId: 'body-id' },
    };
    const { db } = makeDb([message]);

    await relayFor(db).relayPending();

    expect(amqp.publish.mock.calls[0][3]).toMatchObject({
      correlationId: 'body-id',
    });
  });

  it('ignores a poll while the previous one is still running', async () => {
    let release!: () => void;
    amqp.publish.mockReturnValueOnce(
      new Promise((resolve) => (release = () => resolve(true))),
    );
    const { db } = makeDb([row('a')]);
    const relay = relayFor(db);

    const first = relay.relayPending();
    await expect(relay.relayPending()).resolves.toBe(0);

    release();
    await expect(first).resolves.toBe(1);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
