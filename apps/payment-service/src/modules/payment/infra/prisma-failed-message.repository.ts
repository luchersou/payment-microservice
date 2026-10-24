import { Injectable } from '@nestjs/common';

import { PrismaService } from '@payment/prisma/prisma.service';

import { CorrelationLogger } from '@common/logger';

export interface FailedMessage {
  queue: string;
  routingKey: string;
  payload: unknown;
  error?: string;
}

/** Dead letters kept for inspection and replay (failed_messages) */
@Injectable()
export class PrismaFailedMessageRepository {
  private readonly logger = new CorrelationLogger(
    PrismaFailedMessageRepository.name,
  );

  constructor(private readonly prisma: PrismaService) {}

  async save(message: FailedMessage): Promise<void> {
    try {
      await this.prisma.failedMessage.create({
        data: {
          queue: message.queue,
          routingKey: message.routingKey,
          payload: message.payload as object,
          error: message.error,
        },
      });

      this.logger.log(
        `💾 Failed message saved — queue: ${message.queue} | routingKey: ${message.routingKey}`,
      );
    } catch (err) {
      this.logger.error(
        `❌ Could not save failed message to database — queue: ${message.queue} | routingKey: ${message.routingKey}`,
        err instanceof Error ? err.stack : String(err),
      );
      throw err;
    }
  }
}
