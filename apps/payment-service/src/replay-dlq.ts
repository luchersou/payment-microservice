/**
 * Republishes dead letters stored in failed_messages to their original queue.
 * Fix the cause of the failures first, then:
 *
 *   npm run dlq:replay:payment -- [--limit 100] [--queue <dlq name>]
 *   docker exec payment-service node /app/dist/apps/payment-service/src/replay-dlq.js
 */
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '@payment/prisma/prisma.module';
import { PrismaService } from '@payment/prisma/prisma.service';

import { createEnvValidator } from '@common/config';
import { runDlqReplayCli } from '@messaging/dlq';

import { PaymentEnvironment } from './config/env.validation';

void runDlqReplayCli({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: createEnvValidator(PaymentEnvironment),
    }),
    PrismaModule,
  ],
  database: PrismaService,
});
