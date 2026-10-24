import {
  DynamicModule,
  Inject,
  Injectable,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Type,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

import { CorrelationLogger } from '@common/logger';

import { OutboxDatabase, OutboxRelay } from './outbox-relay';

const OUTBOX_DATABASE = Symbol('OUTBOX_DATABASE');

/** Polls the outbox on an interval (OUTBOX_POLL_INTERVAL_MS) */
@Injectable()
export class OutboxRelayRunner
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new CorrelationLogger(OutboxRelayRunner.name);
  private readonly relay: OutboxRelay;
  private readonly intervalMs: number;
  private timer?: NodeJS.Timeout;

  constructor(
    @Inject(OUTBOX_DATABASE) db: OutboxDatabase,
    amqp: AmqpConnection,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>('OUTBOX_POLL_INTERVAL_MS', 1000);
    this.relay = new OutboxRelay(db, amqp, {
      batchSize: config.get<number>('OUTBOX_BATCH_SIZE', 100),
      publishTimeoutMs: config.get<number>('OUTBOX_PUBLISH_TIMEOUT_MS', 5000),
    });
  }

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private async tick() {
    try {
      await this.relay.relayPending();
    } catch (error) {
      // Database unavailable or transaction timeout: the next poll retries
      this.logger.error(
        '❌ Outbox relay poll failed',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

@Module({})
export class OutboxModule {
  /** `database`: the service's PrismaService (type-checked as OutboxDatabase) */
  static forRoot(database: Type<OutboxDatabase>): DynamicModule {
    return {
      module: OutboxModule,
      providers: [
        { provide: OUTBOX_DATABASE, useExisting: database },
        OutboxRelayRunner,
      ],
    };
  }
}
