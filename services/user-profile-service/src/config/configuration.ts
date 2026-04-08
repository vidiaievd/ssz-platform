import { z } from 'zod';

// Zod schema for all environment variables.
// Only PORT and NODE_ENV are required now; the rest are optional
// until their respective infrastructure modules are added.
export const envSchema = z.object({
  // Application
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  // Database — required in production, optional in development/test
  DATABASE_URL: z.string().url().optional(),

  // RabbitMQ
  RABBITMQ_URL: z.string().optional(),

  // Redis
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().int().positive().optional(),

  // Auth / JWT (PEM public key, newlines encoded as \n in env)
  JWT_PUBLIC_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

// Validates process.env and throws with a clear message on failure.
// Called by ConfigModule.forRoot({ validate }) at startup.
export function validate(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  [${issue.path.join('.')}] ${issue.message}`)
      .join('\n');

    throw new Error(`Configuration validation failed:\n${formatted}`);
  }

  return result.data;
}

// Typed config factory consumed by ConfigModule.forRoot({ load: [configuration] }).
// Returns a nested object that ConfigService can query with type safety.
export default (): Env => envSchema.parse(process.env);
