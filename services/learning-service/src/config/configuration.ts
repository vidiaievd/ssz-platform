import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3007),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  DATABASE_URL: z.string().optional(),

  RABBITMQ_URL: z.string().optional(),
  RABBITMQ_EXCHANGE: z.string().default('ssz.events'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(4),
  REDIS_KEY_PREFIX: z.string().default('learning:'),

  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  CONTENT_SERVICE_URL: z.string().min(1, 'CONTENT_SERVICE_URL is required'),
  CONTENT_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  CONTENT_SERVICE_RETRIES: z.coerce.number().int().min(0).default(2),

  ORGANIZATION_SERVICE_URL: z.string().min(1, 'ORGANIZATION_SERVICE_URL is required'),
  ORGANIZATION_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  ORGANIZATION_SERVICE_RETRIES: z.coerce.number().int().min(0).default(2),

  INTERNAL_SERVICE_TOKEN: z.string().min(1, 'INTERNAL_SERVICE_TOKEN is required'),

  SRS_MAX_INTERVAL_DAYS: z.coerce.number().int().positive().default(365),
  SRS_DAILY_NEW_CARDS_LIMIT: z.coerce.number().int().positive().default(20),
  SRS_DAILY_REVIEWS_LIMIT: z.coerce.number().int().positive().default(200),
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
  app: {
    port: number;
    nodeEnv: string;
    logLevel: string;
  };
  database: {
    url: string | undefined;
  };
  rabbitmq: {
    url: string | undefined;
    exchange: string;
  };
  redis: {
    host: string;
    port: number;
    password: string | undefined;
    db: number;
    keyPrefix: string;
  };
  jwt: {
    publicKey: string | undefined;
    publicKeyPath: string | undefined;
    issuer: string;
    audience: string;
  };
  content: {
    baseUrl: string;
    timeoutMs: number;
    retries: number;
  };
  organization: {
    baseUrl: string;
    timeoutMs: number;
    retries: number;
  };
  internalServiceToken: string;
  srs: {
    maxIntervalDays: number;
    dailyNewCardsLimit: number;
    dailyReviewsLimit: number;
  };
}

export default (): AppConfig => {
  const env = envSchema.parse(process.env);

  return {
    app: {
      port: env.PORT,
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
    },
    database: {
      url: env.DATABASE_URL,
    },
    rabbitmq: {
      url: env.RABBITMQ_URL,
      exchange: env.RABBITMQ_EXCHANGE,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX,
    },
    jwt: {
      publicKey: env.JWT_PUBLIC_KEY,
      publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    content: {
      baseUrl: env.CONTENT_SERVICE_URL,
      timeoutMs: env.CONTENT_SERVICE_TIMEOUT_MS,
      retries: env.CONTENT_SERVICE_RETRIES,
    },
    organization: {
      baseUrl: env.ORGANIZATION_SERVICE_URL,
      timeoutMs: env.ORGANIZATION_SERVICE_TIMEOUT_MS,
      retries: env.ORGANIZATION_SERVICE_RETRIES,
    },
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    srs: {
      maxIntervalDays: env.SRS_MAX_INTERVAL_DAYS,
      dailyNewCardsLimit: env.SRS_DAILY_NEW_CARDS_LIMIT,
      dailyReviewsLimit: env.SRS_DAILY_REVIEWS_LIMIT,
    },
  };
};
