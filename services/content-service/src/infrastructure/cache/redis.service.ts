import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppConfig } from '../../config/configuration.js';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService<AppConfig>) {}

  onModuleInit(): void {
    const redisConfig = this.config.get<AppConfig['redis']>('redis');

    if (!redisConfig?.host) {
      this.logger.warn('REDIS_HOST is not configured — cache is disabled');
      return;
    }

    this.client = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      db: redisConfig.db,
      keyPrefix: redisConfig.keyPrefix,
      password: redisConfig.password,
      // Retry connection with a fixed 3-second delay (up to 10 attempts)
      retryStrategy: (times: number) => {
        if (times > 10) {
          this.logger.error('Redis: max reconnection attempts reached');
          return null; // stop retrying
        }
        return 3000;
      },
      lazyConnect: false,
    });

    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('ready', () => this.logger.log('Redis ready'));
    this.client.on('error', (err: Error) => this.logger.error(`Redis error: ${err.message}`));
    this.client.on('close', () => this.logger.warn('Redis connection closed'));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis connection closed');
    }
  }

  // Returns the underlying ioredis client.
  // Callers must handle null (cache disabled) gracefully.
  getClient(): Redis | null {
    return this.client;
  }
}
