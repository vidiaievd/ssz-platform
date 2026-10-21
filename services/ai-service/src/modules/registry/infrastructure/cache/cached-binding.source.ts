import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { RedisService } from '../../../../infrastructure/cache/redis.service.js';
import { BINDING_REPOSITORY, type IBindingRepository } from '../../application/ports/binding.repository.js';
import type { IBindingChangeNotifier, IBindingSource } from '../../application/ports/binding.source.js';
import type { AiBinding } from '../../domain/binding.js';

/**
 * Redis pub/sub channel carrying the capability code of a binding just written. Pub/sub
 * rather than a RabbitMQ event: it is a cache-invalidation signal between instances of
 * this service, nobody else consumes it, and a lost message only costs one TTL.
 */
export const BINDING_CHANGED_CHANNEL = 'ai.binding.changed';

/**
 * Bindings are read on every model call and written a few times a month, so they live in
 * memory. A write drops the entry here at once and on the other instances through
 * Redis; the TTL bounds staleness if Redis was away when that message went out.
 */
@Injectable()
export class CachedBindingSource implements IBindingSource, IBindingChangeNotifier, OnModuleInit {
  private readonly logger = new Logger(CachedBindingSource.name);
  private readonly cache = new Map<string, { binding: AiBinding | null; expiresAt: number }>();
  private readonly ttlMs: number;

  constructor(
    @Inject(BINDING_REPOSITORY) private readonly repository: IBindingRepository,
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    this.ttlMs = config.get<number>('bindingCacheTtlMs') ?? 60_000;
  }

  async onModuleInit(): Promise<void> {
    const subscriber = this.redis.createSubscriber();
    if (!subscriber) return;
    subscriber.on('message', (_channel: string, capability: string) => this.cache.delete(capability));
    await subscriber.subscribe(BINDING_CHANGED_CHANNEL).catch((err: Error) => {
      this.logger.warn(`Binding invalidation not subscribed, TTL only: ${err.message}`);
    });
  }

  async get(capability: string): Promise<AiBinding | null> {
    const hit = this.cache.get(capability);
    if (hit && hit.expiresAt > Date.now()) return hit.binding;
    const binding = await this.repository.get(capability);
    this.cache.set(capability, { binding, expiresAt: Date.now() + this.ttlMs });
    return binding;
  }

  async changed(capability: string): Promise<void> {
    this.cache.delete(capability);
    const client = this.redis.getClient();
    if (!client || !this.redis.isReady()) {
      this.logger.warn(`Redis not ready: other instances see binding "${capability}" after the TTL`);
      return;
    }
    await client.publish(BINDING_CHANGED_CHANNEL, capability).catch((err: Error) => {
      this.logger.warn(`Binding change for "${capability}" not broadcast: ${err.message}`);
    });
  }
}
