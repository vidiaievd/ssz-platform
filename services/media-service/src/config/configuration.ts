import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3004),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('debug'),

  DATABASE_URL: z.string().optional(),

  RABBITMQ_URL: z.string().optional(),
  RABBITMQ_EXCHANGE: z.string().default('media.events'),

  // Redis — shared for BullMQ queues and cache
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default('media:'),

  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_PUBLIC_KEY_PATH: z.string().optional(),
  JWT_ISSUER: z.string().default('https://auth.ssz-platform.internal'),
  JWT_AUDIENCE: z.string().default('ssz-services'),

  // Service-to-service routes under /internal/* (engine, web BFF) — 'x-internal-token'.
  INTERNAL_SERVICE_TOKEN: z.string().min(1, 'INTERNAL_SERVICE_TOKEN is required'),

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
  // External URL reachable by browsers — overrides internal endpoint in presigned URLs.
  // In Docker dev: http://localhost:9000. In prod: your S3/MinIO public hostname.
  MINIO_PUBLIC_BASE_URL: z.string().optional(),

  // Pre-signed URL TTLs (seconds)
  PRESIGNED_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(900),   // 15 min
  PRESIGNED_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(3600), // 1 hour

  // File size limits (bytes)
  MAX_IMAGE_SIZE_BYTES: z.coerce.number().int().positive().default(20 * 1024 * 1024),   // 20 MB
  MAX_AUDIO_SIZE_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),  // 100 MB
  MAX_VIDEO_SIZE_BYTES: z.coerce.number().int().positive().default(500 * 1024 * 1024),  // 500 MB

  // Piper TTS (pronunciation synthesis)
  PIPER_URL: z.string().default('http://piper-tts:5000'),
  PIPER_VOICE: z.string().default('no_NO-talesyntese-medium'),
  // Catalog ids (`nvcc-kon`, …) not offered to authors — a voice that sounds regional or poor.
  TTS_HIDDEN_VOICES: z
    .string()
    .default('')
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean)),
  PIPER_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  // A pronunciation is a word or a short phrase; anything longer is a misuse
  // of the endpoint, not a vocabulary item.
  TTS_MAX_TEXT_LENGTH: z.coerce.number().int().positive().default(120),
  // A lesson narration (plan 74): the spoken characters of the script, not the markdown.
  NARRATION_MAX_CHARS: z.coerce.number().int().positive().default(12_000),
  // How a lesson narration is spoken (not a word's pronunciation clip). Above 1 is slower. The
  // voice's default pace reads quickly for a learner, and noise-w 0 (below) shortens phonemes by
  // itself: measured on a paragraph, 1.4 only matches the defaults, 1.7 is ~17% slower.
  // noise-w 0 removes the random pauses Piper adds inside sentences at its default of 0.8
  // (measured: up to 1.7 s).
  NARRATION_LENGTH_SCALE: z.coerce.number().min(0.5).max(2.5).default(1.7),
  NARRATION_NOISE_W_SCALE: z.coerce.number().min(0).max(1).default(0),
  // A replaced lesson narration stays playable and restorable this long (D5), then the sweep may remove it.
  NARRATION_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  // Asked before a replaced narration is removed: does any lesson body still name it?
  CONTENT_SERVICE_URL: z.string().default('http://content-service:3003'),
  CONTENT_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // Orphan recordings (plan 71): a recording no attempt stands on, older than the minimum age.
  // 'dry-run' only logs what it would delete; 'delete' purges (soft-delete + storage objects).
  MEDIA_ORPHAN_SWEEP_MODE: z.enum(['dry-run', 'delete']).default('dry-run'),
  MEDIA_ORPHAN_MIN_AGE_DAYS: z.coerce.number().int().min(1).default(30),
  MEDIA_ORPHAN_MAX_PER_RUN: z.coerce.number().int().positive().default(2000),
  // Asked before anything is deleted; no answer means nothing is.
  EXERCISE_ENGINE_URL: z.string().default('http://exercise-engine-service:3006'),
  EXERCISE_ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

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
  internalServiceToken: string;
  minio: {
    endpoint: string;
    port: number;
    useSsl: boolean;
    accessKey: string;
    secretKey: string;
    bucketPublic: string;
    bucketPrivate: string;
    publicBaseUrl: string | undefined;
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
  orphanSweep: {
    mode: 'dry-run' | 'delete';
    minAgeDays: number;
    maxPerRun: number;
  };
  exerciseEngine: {
    baseUrl: string;
    timeoutMs: number;
  };
  tts: {
    piperUrl: string;
    piperVoice: string;
    hiddenVoices: string[];
    piperTimeoutMs: number;
    maxTextLength: number;
    narrationMaxChars: number;
    narrationLengthScale: number;
    narrationNoiseWScale: number;
    narrationRetentionDays: number;
  };
  contentService: {
    baseUrl: string;
    timeoutMs: number;
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
    internalServiceToken: env.INTERNAL_SERVICE_TOKEN,
    minio: {
      endpoint: env.MINIO_ENDPOINT,
      port: env.MINIO_PORT,
      useSsl: env.MINIO_USE_SSL,
      accessKey: env.MINIO_ACCESS_KEY,
      secretKey: env.MINIO_SECRET_KEY,
      bucketPublic: env.MINIO_BUCKET_PUBLIC,
      bucketPrivate: env.MINIO_BUCKET_PRIVATE,
      publicBaseUrl: env.MINIO_PUBLIC_BASE_URL,
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
    orphanSweep: {
      mode: env.MEDIA_ORPHAN_SWEEP_MODE,
      minAgeDays: env.MEDIA_ORPHAN_MIN_AGE_DAYS,
      maxPerRun: env.MEDIA_ORPHAN_MAX_PER_RUN,
    },
    exerciseEngine: {
      baseUrl: env.EXERCISE_ENGINE_URL,
      timeoutMs: env.EXERCISE_ENGINE_TIMEOUT_MS,
    },
    tts: {
      piperUrl: env.PIPER_URL,
      piperVoice: env.PIPER_VOICE,
      hiddenVoices: env.TTS_HIDDEN_VOICES,
      piperTimeoutMs: env.PIPER_TIMEOUT_MS,
      maxTextLength: env.TTS_MAX_TEXT_LENGTH,
      narrationMaxChars: env.NARRATION_MAX_CHARS,
      narrationLengthScale: env.NARRATION_LENGTH_SCALE,
      narrationNoiseWScale: env.NARRATION_NOISE_W_SCALE,
      narrationRetentionDays: env.NARRATION_RETENTION_DAYS,
    },
    contentService: {
      baseUrl: env.CONTENT_SERVICE_URL,
      timeoutMs: env.CONTENT_SERVICE_TIMEOUT_MS,
    },
  };
};
