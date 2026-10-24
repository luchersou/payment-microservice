import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

// Implicit type conversion reads design:type metadata, which only exists
// if reflect-metadata is loaded before the classes below are decorated.
import 'reflect-metadata';

/** Variables shared by every service */
export class BaseEnvironment {
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number;

  @IsString()
  @Matches(/^amqps?:\/\//, {
    message: 'RABBITMQ_URL must be an amqp(s):// URL',
  })
  RABBITMQ_URL = 'amqp://localhost:5672';
}

/** Variables for services that own a database */
export class DatabaseEnvironment extends BaseEnvironment {
  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  })
  DATABASE_URL: string;

  /** How often the outbox relay looks for unpublished events */
  @IsInt()
  @Min(100)
  OUTBOX_POLL_INTERVAL_MS = 1000;

  @IsInt()
  @Min(1)
  OUTBOX_BATCH_SIZE = 100;

  @IsInt()
  @Min(100)
  OUTBOX_PUBLISH_TIMEOUT_MS = 5000;
}

/**
 * Builds a ConfigModule `validate` function: converts types, applies the
 * schema's defaults and fails fast at boot with every invalid variable.
 */
export function createEnvValidator<T extends object>(schema: new () => T) {
  return (config: Record<string, unknown>): T => {
    const validated = plainToInstance(schema, config, {
      enableImplicitConversion: true,
      exposeDefaultValues: true,
    });

    const errors = validateSync(validated);

    if (errors.length > 0) {
      const details = errors
        .map(
          (error) =>
            `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
        )
        .join('\n');

      throw new Error(`Invalid environment configuration:\n${details}`);
    }

    return validated;
  };
}
