import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3008),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  DATABASE_URL: z.string().optional(),

  RABBITMQ_URL: z.string().optional(),

  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  ORGANIZATION_SERVICE_URL: z.string().default('http://organization-service:3002'),
  LEARNING_SERVICE_URL: z.string().default('http://learning-service:3005'),
  EXERCISE_ENGINE_SERVICE_URL: z.string().default('http://exercise-engine-service:3006'),
  INTERNAL_SERVICE_TOKEN: z.string().default('internal-dev-token'),

  AT_RISK_THRESHOLD_DAYS: z.coerce.number().int().positive().default(7),
  DROPOFF_COMPLETION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.3),

  // How fast the mastery profile forgets (plan 55 §3.9 rule 1, Q2). **Not calibrated** —
  // Q2 closes on live data, and it is configuration rather than a constant precisely so
  // that the answer, when it arrives, is a deployment and not a release.
  MASTERY_EWMA_ALPHA: z.coerce.number().gt(0).max(1).default(0.2),

  // How much evidence a cell needs before the profile will say anything about it
  // (§3.9 rule 3). Weighted, not counted: twenty picks out of four are worth about seven
  // typed answers. **Not calibrated** — Q2, same as the alpha above.
  MASTERY_MIN_WEIGHTED_SAMPLE: z.coerce.number().positive().default(8),
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
  organization: { baseUrl: string; token: string };
  learning: { baseUrl: string };
  exerciseEngine: { baseUrl: string; token: string };
  metrics: { atRiskThresholdDays: number; dropoffCompletionThreshold: number };
  mastery: { ewmaAlpha: number; minWeightedSample: number };
  /** Shared secret for service-to-service routes — the same one the clients above send. */
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
    organization: { baseUrl: env.ORGANIZATION_SERVICE_URL, token: env.INTERNAL_SERVICE_TOKEN },
    learning: { baseUrl: env.LEARNING_SERVICE_URL },
    exerciseEngine: { baseUrl: env.EXERCISE_ENGINE_SERVICE_URL, token: env.INTERNAL_SERVICE_TOKEN },
    metrics: {
      atRiskThresholdDays: env.AT_RISK_THRESHOLD_DAYS,
      dropoffCompletionThreshold: env.DROPOFF_COMPLETION_THRESHOLD,
    },
    mastery: {
      ewmaAlpha: env.MASTERY_EWMA_ALPHA,
      minWeightedSample: env.MASTERY_MIN_WEIGHTED_SAMPLE,
    },
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
  };
};
