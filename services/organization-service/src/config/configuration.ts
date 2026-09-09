import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3002),
  DATABASE_URL: z.string().min(1),
  RABBITMQ_URL: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  INVITATION_JWT_SECRET: z.string().min(32),
  APP_BASE_URL: z.url().default('http://localhost:3000'),
  PROFILE_SERVICE_URL: z.url().optional(),
  SCHEDULING_SERVICE_URL: z.url().optional(),
  INTERNAL_SERVICE_TOKEN: z.string().min(1, 'INTERNAL_SERVICE_TOKEN is required'),
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
  INVITATION_JWT_SECRET: process.env['INVITATION_JWT_SECRET'] ?? '',
  APP_BASE_URL: process.env['APP_BASE_URL'] ?? 'http://localhost:3000',
  PROFILE_SERVICE_URL: process.env['PROFILE_SERVICE_URL'],
  SCHEDULING_SERVICE_URL: process.env['SCHEDULING_SERVICE_URL'],
  INTERNAL_SERVICE_TOKEN: process.env['INTERNAL_SERVICE_TOKEN'] ?? '',
});
