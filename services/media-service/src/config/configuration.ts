import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3004),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  DATABASE_URL: z.string().optional(),

  RABBITMQ_URL: z.string().optional(),
  RABBITMQ_EXCHANGE: z.string().default('ssz.events'),

  // Redis — shared for BullMQ queues and cache
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default('media:'),

  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  // MinIO / S3
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_USE_SSL: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  MINIO_ACCESS_KEY: z.string().min(1, 'MINIO_ACCESS_KEY is required'),
  MINIO_SECRET_KEY: z.string().min(1, 'MINIO_SECRET_KEY is required'),
  MINIO_BUCKET_PUBLIC: z.string().default('ssz-public'),
  MINIO_BUCKET_PRIVATE: z.string().default('ssz-private'),

  // Pre-signed URL TTLs (seconds)
  PRESIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(900),   // 15 min
  PRESIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(3600), // 1 hour

  // File size limits (bytes)
  MAX_IMAGE_SIZE_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),   // 20 MB
  MAX_AUDIO_SIZE_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),  // 100 MB
  MAX_VIDEO_SIZE_BYTES: z.coerce.number().int().positive().default(500 * 1024 * 1024),  // 500 MB

  // BullMQ
  QUEUE_IMAGE_PROCESSING: z.string().default('image-processing'),
  QUEUE_AUDIO_PROCESSING: z.string().default('audio-processing'),
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
    keyPrefix: string;
  };
  jwt: {
    publicKey: string | undefined;
    publicKeyPath: string | undefined;
    issuer: string;
    audience: string;
  };
  minio: {
    endpoint: string;
    port: number;
    useSsl: boolean;
    accessKey: string;
    secretKey: string;
    bucketPublic: string;
    bucketPrivate: string;
  };
  upload: {
    presignedUploadTtlSeconds: number;
    presignedDownloadTtlSeconds: number;
    maxImageSizeBytes: number;
    maxAudioSizeBytes: number;
    maxVideoSizeBytes: number;
  };
  queues: {
    imageProcessing: string;
    audioProcessing: string;
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
    database: { url: env.DATABASE_URL },
    rabbitmq: {
      url: env.RABBITMQ_URL,
      exchange: env.RABBITMQ_EXCHANGE,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      keyPrefix: env.REDIS_KEY_PREFIX,
    },
    jwt: {
      publicKey: env.JWT_PUBLIC_KEY,
      publicKeyPath: env.JWT_PUBLIC_KEY_PATH,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
    minio: {
      endpoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSsl: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
      bucketPublic: env.MINIO_BUCKET_PUBLIC,
      bucketPrivate: env.MINIO_BUCKET_PRIVATE,
    },
    upload: {
      presignedUploadTtlSeconds: env.PRESIGNED_UPLOAD_TTL_SECONDS,
      presignedDownloadTtlSeconds: env.PRESIGNED_DOWNLOAD_TTL_SECONDS,
      maxImageSizeBytes: env.MAX_IMAGE_SIZE_BYTES,
      maxAudioSizeBytes: env.MAX_AUDIO_SIZE_BYTES,
      maxVideoSizeBytes: env.MAX_VIDEO_SIZE_BYTES,
    },
    queues: {
      imageProcessing: env.QUEUE_IMAGE_PROCESSING,
      audioProcessing: env.QUEUE_AUDIO_PROCESSING,
    },
  };
};
