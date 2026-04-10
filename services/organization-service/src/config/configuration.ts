import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validate(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Configuration validation error: ${result.error.message}`);
  }
  return result.data;
}

export default (): Env => ({
  NODE_ENV: (process.env['NODE_ENV'] as Env['NODE_ENV']) ?? 'development',
  PORT: Number(process.env['PORT'] ?? 3002),
  DATABASE_URL: process.env['DATABASE_URL'] ?? '',
  RABBITMQ_URL: process.env['RABBITMQ_URL'] ?? '',
  JWT_PUBLIC_KEY: process.env['JWT_PUBLIC_KEY'] ?? '',
});
