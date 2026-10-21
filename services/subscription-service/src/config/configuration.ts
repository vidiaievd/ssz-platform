import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3011),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  DATABASE_URL: z.string().optional(),

  RABBITMQ_URL: z.string().optional(),

  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  INTERNAL_SERVICE_TOKEN: z.string().default('internal-dev-token'),

  ORGANIZATION_SERVICE_URL: z.string().default('http://organization-service:3002'),
});

export type Env = z.infer<typeof envSchema>;

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

export interface AppConfig {
  app: { port: number; nodeEnv: string; logLevel: string };
  database: { url: string | undefined };
  rabbitmq: { url: string | undefined };
  jwt: { publicKey: string | undefined; publicKeyPath: string | undefined; issuer: string; audience: string };
  /** Shared secret for service-to-service routes (`x-internal-token`). */
  internalServiceToken: string;
  /** Asked whether a caller of `/subscriptions/me` belongs to the workspace they name. */
  organization: { baseUrl: string };
}

export default (): AppConfig => {
  const env = envSchema.parse(process.env);
  return {
    app: { port: env.PORT, nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL },
    database: { url: env.DATABASE_URL },
    rabbitmq: { url: env.RABBITMQ_URL },
    jwt: {
      publicKey: env.JWT_PUBLIC_KEY,
      publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    organization: { baseUrl: env.ORGANIZATION_SERVICE_URL },
  };
};
