/**
 * Republishes dead letters stored in failed_messages to their original queue.
 * Fix the cause of the failures first, then:
 *
 *   npm run dlq:replay:order -- [--limit 100] [--queue <dlq name>]
 *   docker exec order-service node /app/dist/apps/order-service/src/replay-dlq.js
 */
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '@order/prisma/prisma.module';
import { PrismaService } from '@order/prisma/prisma.service';

import { createEnvValidator } from '@common/config';
import { runDlqReplayCli } from '@messaging/dlq';

import { OrderEnvironment } from './config/env.validation';

void runDlqReplayCli({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(OrderEnvironment),
    }),
    PrismaModule,
  ],
  database: PrismaService,
});
