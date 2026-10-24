import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3010),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  DATABASE_URL: z.string().optional(),

  RABBITMQ_URL: z.string().optional(),

  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  INTERNAL_SERVICE_TOKEN: z.string().default('internal-dev-token'),

  REDIS_HOST: z.string().default('redis'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(6),
  REDIS_KEY_PREFIX: z.string().default('ai:'),

  // Circuit breaker per model (plan 77, step 7): this many retryable failures within the
  // window open it for AI_BREAKER_OPEN_MS, during which the router goes to the fallback.
  AI_BREAKER_FAILURES: z.coerce.number().int().positive().default(5),
  AI_BREAKER_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  AI_BREAKER_OPEN_MS: z.coerce.number().int().positive().default(30_000),
  // Safety net for the binding cache; a write invalidates it at once on every instance.
  AI_BINDING_CACHE_TTL_MS: z.coerce.number().int().positive().default(60_000),

  // Ledger (plan 77, step 8): credits charged per one USD of model cost. One rate for every
  // agent; a plain decimal with at most six places. 1000 → one credit is a tenth of a cent.
  AI_CREDITS_PER_USD: z
    .string()
    .regex(/^\d+(\.\d{1,6})?$/, 'a plain non-negative decimal, at most six places')
    .default('1000'),
  // How often the spool of ledger rows that missed the database is moved in (step 8a).
  AI_LEDGER_SPOOL_DRAIN_MS: z.coerce.number().int().positive().default(5_000),

  // Access gate (plan 78 §6): tariffs are projected from subscription.events; a payer
  // without a fresh row is read through subscription-service's internal API.
  SUBSCRIPTION_SERVICE_URL: z.string().url().default('http://subscription-service:3011'),
  // Review drafts (plan 79, step 1.3): the submission is read from and the draft written to
  // exercise-engine; the school's explanation language comes from organization-service.
  EXERCISE_ENGINE_URL: z.string().url().default('http://exercise-engine-service:3006'),
  ORGANIZATION_SERVICE_URL: z.string().url().default('http://organization-service:3002'),
  // A learner's own review (step 2.2c) is written in their interface language, from user-profile-service.
  PROFILE_SERVICE_URL: z.string().url().default('http://user-profile-service:3001'),
  // How often quota counters are raised to the ledger's sums (step 9b). A day by default.
  AI_QUOTA_RECONCILE_MS: z.coerce.number().int().positive().default(86_400_000),
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
  redis: { host: string; port: number; password: string | undefined; db: number; keyPrefix: string };
  breaker: { failures: number; windowMs: number; openMs: number };
  bindingCacheTtlMs: number;
  creditsPerUsd: string;
  ledgerSpoolDrainMs: number;
  subscriptionServiceUrl: string;
  exerciseEngineUrl: string;
  organizationServiceUrl: string;
  profileServiceUrl: string;
  quotaReconcileMs: number;
  /** Shared secret for service-to-service routes (`x-internal-token`). */
  internalServiceToken: string;
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
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX,
    },
    breaker: { failures: env.AI_BREAKER_FAILURES, windowMs: env.AI_BREAKER_WINDOW_MS, openMs: env.AI_BREAKER_OPEN_MS },
    bindingCacheTtlMs: env.AI_BINDING_CACHE_TTL_MS,
    creditsPerUsd: env.AI_CREDITS_PER_USD,
    ledgerSpoolDrainMs: env.AI_LEDGER_SPOOL_DRAIN_MS,
    subscriptionServiceUrl: env.SUBSCRIPTION_SERVICE_URL,
    exerciseEngineUrl: env.EXERCISE_ENGINE_URL,
    organizationServiceUrl: env.ORGANIZATION_SERVICE_URL,
    profileServiceUrl: env.PROFILE_SERVICE_URL,
    quotaReconcileMs: env.AI_QUOTA_RECONCILE_MS,
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
  };
};
