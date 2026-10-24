import { DynamicModule, Module, ModuleMetadata, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { parseArgs } from 'util';

import { RawSqlDatabase } from '../database';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { replayDeadLetters } from './replay-dead-letters';

@Module({})
class DlqReplayCliModule {}

/**
 * Entry point of a service's `replay-dlq` script:
 *
 *   node dist/apps/<service>/src/replay-dlq.js [--limit 100] [--queue <dlq>]
 *
 * Boots only config, database and RabbitMQ (no consumers, no HTTP server),
 * replays, and exits non-zero if a publish failed.
 */
export async function runDlqReplayCli({
  imports,
  database,
}: {
  /** ConfigModule (global) and the service's PrismaModule */
  imports: NonNullable<ModuleMetadata['imports']>;
  database: Type<RawSqlDatabase>;
}) {
  const { values } = parseArgs({
    options: {
      limit: { type: 'string', default: '100' },
      queue: { type: 'string' },
    },
  });

  const cliModule: DynamicModule = {
    module: DlqReplayCliModule,
    imports: [...imports, RabbitMQModule],
  };
  const app = await NestFactory.createApplicationContext(cliModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const result = await replayDeadLetters(
      app.get(database),
      app.get(AmqpConnection),
      { limit: Number(values.limit), queue: values.queue },
    );

    console.log(
      `DLQ replay: ${result.replayed} replayed, ${result.skipped} skipped${result.failed ? ', stopped on a publish error' : ''}`,
    );
    process.exitCode = result.failed ? 1 : 0;
  } finally {
    await app.close();
  }
}
