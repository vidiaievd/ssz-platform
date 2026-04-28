import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import type { ExerciseDefinition } from '../../shared/application/ports/content-client.port.js';
import { RedisService } from './redis.service.js';

const SCAN_BATCH = 100;

@Injectable()
export class ExerciseDefinitionCache {
  private readonly logger = new Logger(ExerciseDefinitionCache.name);
  private readonly ttl: number;
  private readonly keyPrefix: string;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    this.ttl = config.get<AppConfig['cache']>('cache')!.exerciseDefinitionTtlSeconds;
    // Needed to build SCAN patterns — SCAN does not auto-apply ioredis keyPrefix.
    this.keyPrefix = config.get<AppConfig['redis']>('redis')!.keyPrefix;
  }

  private cacheKey(exerciseId: string, language: string): string {
    return `exercise-def:${exerciseId}:${language}`;
  }

  async get(exerciseId: string, language: string): Promise<ExerciseDefinition | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    const raw = await client.get(this.cacheKey(exerciseId, language));
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as ExerciseDefinition;
    } catch {
      this.logger.warn(`Failed to parse cached definition for exercise ${exerciseId}`);
      return null;
    }
  }

  async set(exerciseId: string, language: string, value: ExerciseDefinition): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    await client.set(
      this.cacheKey(exerciseId, language),
      JSON.stringify(value),
      'EX',
      this.ttl,
    );
  }

  // Removes all language variants for a given exercise.
  // SCAN does not auto-apply ioredis keyPrefix, so the prefix is prepended to the pattern
  // manually. Keys returned by SCAN already contain the prefix, so it is stripped before DEL
  // (DEL auto-applies the prefix again, avoiding double-prefixing).
  async invalidate(exerciseId: string): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    const pattern = `${this.keyPrefix}exercise-def:${exerciseId}:*`;
    let cursor = '0';
    let deleted = 0;

    do {
      const [next, rawKeys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', SCAN_BATCH);
      cursor = next;

      if (rawKeys.length > 0) {
        const stripped = rawKeys.map((k) => k.slice(this.keyPrefix.length));
        await client.del(...stripped);
        deleted += rawKeys.length;
      }
    } while (cursor !== '0');

    if (deleted > 0) {
      this.logger.debug(`Invalidated ${deleted} cache entries for exercise ${exerciseId}`);
    }
  }
}
