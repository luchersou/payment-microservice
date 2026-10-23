import { plainToInstance } from 'class-transformer';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { validateSync } from 'class-validator';

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
