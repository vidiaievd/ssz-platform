import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3005),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  DATABASE_URL: z.string().optional(),

  RABBITMQ_URL: z.string().optional(),
  RABBITMQ_EXCHANGE: z.string().default('ssz.events'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),

  EMAIL_FROM_NAME: z.string().default('SSZ Platform'),
  EMAIL_FROM_ADDRESS: z.string().default('noreply@ssz.local'),

  APP_BASE_URL: z.string().default('http://localhost:3000'),
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
  app: { port: number; nodeEnv: string; logLevel: string; baseUrl: string };
  database: { url: string | undefined };
  rabbitmq: { url: string | undefined; exchange: string };
  redis: { host: string; port: number; password: string | undefined };
  jwt: { publicKey: string | undefined; publicKeyPath: string | undefined; issuer: string; audience: string };
  email: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromAddress: string;
  };
}

export default (): AppConfig => {
  const env = envSchema.parse(process.env);
  return {
    app: { port: env.PORT, nodeEnv: env.NODE_ENV, logLevel: env.LOG_LEVEL, baseUrl: env.APP_BASE_URL },
    database: { url: env.DATABASE_URL },
    rabbitmq: { url: env.RABBITMQ_URL, exchange: env.RABBITMQ_EXCHANGE },
    redis: { host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD },
    jwt: {
      publicKey: env.JWT_PUBLIC_KEY,
      publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    email: {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      fromName: env.EMAIL_FROM_NAME,
      fromAddress: env.EMAIL_FROM_ADDRESS,
    },
  };
};
