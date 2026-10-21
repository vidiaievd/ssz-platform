import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { AppConfig } from '../../config/configuration.js';

/**
 * One command connection, plus subscriber connections handed out on demand (a connection
 * in subscribe mode cannot run other commands).
 *
 * Nothing here is required for a call to succeed: the breaker and the binding cache both
 * degrade to "no breaker" / "TTL only" when Redis is away, so callers check `isReady()`
 * rather than letting a Redis outage take the AI down with it.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly subscribers: Redis[] = [];

  constructor(private readonly config: ConfigService<AppConfig>) {}

  onModuleInit(): void {
    const redisConfig = this.config.get<AppConfig['redis']>('redis');
    if (!redisConfig?.host) {
      this.logger.warn('REDIS_HOST is not configured — circuit breaker and cache invalidation disabled');
      return;
    }

    this.client = new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      keyPrefix: redisConfig.keyPrefix,
      // Fail a command fast instead of queueing it behind a dead connection: a model call
      // must not wait on the breaker.
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: () => 3000,
    });
    this.client.on('ready', () => this.logger.log('Redis ready'));
    this.client.on('error', (err: Error) => this.logger.error(`Redis error: ${err.message}`));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.client, ...this.subscribers].map((c) => c?.quit().catch(() => undefined)));
  }

  getClient(): Redis | null {
    return this.client;
  }

  isReady(): boolean {
    return this.client?.status === 'ready';
  }

  /** A new connection for SUBSCRIBE; null when Redis is not configured. */
  createSubscriber(): Redis | null {
    if (!this.client) return null;
    const subscriber = this.client.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null });
    subscriber.on('error', (err: Error) => this.logger.error(`Redis subscriber error: ${err.message}`));
    this.subscribers.push(subscriber);
    return subscriber;
  }
}
