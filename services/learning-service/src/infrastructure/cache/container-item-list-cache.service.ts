import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service.js';
import type { IContainerItemListCache } from '../../shared/application/ports/container-item-list-cache.port.js';
import { ContentRef, type ContentType } from '../../shared/domain/value-objects/content-ref.js';

const KEY_PREFIX = 'container-items:';
export const DEFAULT_TTL_SECONDS = 600;

@Injectable()
export class RedisContainerItemListCache implements IContainerItemListCache {
  private readonly logger = new Logger(RedisContainerItemListCache.name);

  constructor(private readonly redis: RedisService) {}

  private key(containerId: string): string {
    return `${KEY_PREFIX}${containerId}`;
  }

  async get(containerId: string): Promise<ContentRef[] | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    try {
      const raw = await client.get(this.key(containerId));
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Array<{ type: string; id: string }>;
      const refs: ContentRef[] = [];
      for (const item of parsed) {
        const result = ContentRef.create(item.type as ContentType, item.id);
        if (result.isFail) {
          this.logger.warn(`Corrupted cache entry for container ${containerId} — treating as miss`);
          return null;
        }
        refs.push(result.value);
      }
      return refs;
    } catch (err) {
      this.logger.error(`Cache get error [${containerId}]: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async set(
    containerId: string,
    items: ContentRef[],
    ttlSeconds = DEFAULT_TTL_SECONDS,
  ): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      const value = JSON.stringify(items.map((r) => ({ type: r.type, id: r.id })));
      await client.set(this.key(containerId), value, 'EX', ttlSeconds);
    } catch (err) {
      this.logger.error(`Cache set error [${containerId}]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async invalidate(containerId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    try {
      await client.del(this.key(containerId));
    } catch (err) {
      this.logger.error(`Cache invalidate error [${containerId}]: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
