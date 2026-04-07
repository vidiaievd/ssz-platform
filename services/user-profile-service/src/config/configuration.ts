import * as Joi from 'joi';

// Typed configuration object returned by the config factory.
// All values are read once at startup and validated by the Joi schema below.
export const configuration = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  database: {
    url: process.env.DATABASE_URL,
  },

  rabbitmq: {
    url: process.env.RABBITMQ_URL,
    queue: process.env.RABBITMQ_QUEUE_PROFILES || 'profile_service_queue',
    exchangeUsers: process.env.RABBITMQ_EXCHANGE_USERS || 'users_exchange',
    exchangeProfiles: process.env.RABBITMQ_EXCHANGE_PROFILES || 'profiles_exchange',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    ttl: parseInt(process.env.REDIS_TTL_SECONDS || '3600', 10),
  },

  jwt: {
    // PEM-formatted RSA public key from Auth Service
    publicKey: process.env.JWT_PUBLIC_KEY,
    algorithm: process.env.JWT_ALGORITHM || 'RS256',
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

// Joi validation schema — the application will fail fast at startup
// if any required environment variable is missing or malformed.
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3001),

  DATABASE_URL: Joi.string().uri().required(),

  RABBITMQ_URL: Joi.string().required(),
  RABBITMQ_QUEUE_PROFILES: Joi.string().default('profile_service_queue'),
  RABBITMQ_EXCHANGE_USERS: Joi.string().default('users_exchange'),
  RABBITMQ_EXCHANGE_PROFILES: Joi.string().default('profiles_exchange'),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_TTL_SECONDS: Joi.number().default(3600),

  JWT_PUBLIC_KEY: Joi.string().required(),
  JWT_ALGORITHM: Joi.string().default('RS256'),

  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info'),
});

export type AppConfig = ReturnType<typeof configuration>;
