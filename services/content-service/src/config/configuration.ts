import { z } from 'zod';

// Flat Zod schema for all environment variables.
// Used by ConfigModule.forRoot({ validate }) — runs before any module initialises.
export const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3003),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  // Database (PostgreSQL)
  DATABASE_URL: z.string().optional(),

  // RabbitMQ
  RABBITMQ_URL: z.string().optional(),
  RABBITMQ_EXCHANGE: z.string().default('ssz.events'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_DB: z.coerce.number().int().min(0).default(3),
  REDIS_KEY_PREFIX: z.string().default('content:'),
  REDIS_PASSWORD: z.string().optional(),

  // JWT — RS256 public key from Auth Service.
  // Provide either JWT_PUBLIC_KEY (inline PEM, \n as literal backslash-n in .env)
  // or JWT_PUBLIC_KEY_PATH (path to .pem file). Verifier reads both, key takes priority.
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  // Organization Service (synchronous role checks for VisibilityGuard)
  ORGANIZATION_SERVICE_URL: z.string().min(1, 'ORGANIZATION_SERVICE_URL is required'),
  ORGANIZATION_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  ORGANIZATION_SERVICE_RETRIES: z.coerce.number().int().min(0).default(2),
  INTERNAL_SERVICE_TOKEN: z.string().min(1, 'INTERNAL_SERVICE_TOKEN is required'),

  // Discovery / catalog pagination
  DISCOVERY_DEFAULT_LIMIT: z.coerce.number().int().min(1).max(100).default(20),
  DISCOVERY_MAX_LIMIT: z.coerce.number().int().min(1).max(500).default(100),
});

export type Env = z.infer<typeof envSchema>;

// Validates process.env at startup. Throws with a clear message on failure.
// Passed to ConfigModule.forRoot({ validate }).
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

// Typed config factory. Returns a nested object for organised access via
// ConfigService.get('rabbitmq.url'), ConfigService.get('app.port'), etc.
// Passed to ConfigModule.forRoot({ load: [configuration] }).
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
    db: number;
    keyPrefix: string;
    password: string | undefined;
  };
  jwt: {
    publicKey: string | undefined;
    publicKeyPath: string | undefined;
    issuer: string | undefined;
    audience: string | undefined;
  };
  organization: {
    baseUrl: string;
    timeoutMs: number;
    retries: number;
    internalAuthToken: string;
  };
  discovery: {
    pagination: {
      defaultLimit: number;
      maxLimit: number;
    };
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
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX,
      password: env.REDIS_PASSWORD,
    },
    jwt: {
      publicKey: env.JWT_PUBLIC_KEY,
      publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    organization: {
      baseUrl: env.ORGANIZATION_SERVICE_URL,
      timeoutMs: env.ORGANIZATION_SERVICE_TIMEOUT_MS,
      retries: env.ORGANIZATION_SERVICE_RETRIES,
      internalAuthToken: env.INTERNAL_SERVICE_TOKEN,
    },
    discovery: {
      pagination: {
        defaultLimit: env.DISCOVERY_DEFAULT_LIMIT,
        maxLimit: env.DISCOVERY_MAX_LIMIT,
      },
    },
  };
};
