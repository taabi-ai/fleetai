import { z } from 'zod';

export const configSchema = z.object({
  SERVICE_NAME: z.string().default('template'),
  PORT: z.coerce.number().default(4099),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  DATABASE_URL: z.string().url().optional(),
  KAFKA_BROKERS: z.string().optional(),
  REDIS_URL: z.string().url().optional(),
});

export type Config = z.infer<typeof configSchema>;

// Values are read through @fleetai/config in real services (env -> DB override);
// the template parses process.env directly with Zod for a typed config object.
export const config: Config = configSchema.parse(process.env);
