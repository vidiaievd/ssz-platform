import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import type { ExercisePlacement } from '../../shared/application/ports/content-client.port.js';
import { RedisService } from './redis.service.js';

// Placement changes rarely — an exercise moving to a different course/module is
// an authoring event, not a routine one — so a short TTL trades a little staleness
// for skipping a network call on every attempt start (plan 44 §4 risk table).
@Injectable()
export class ExercisePlacementCache {
  private readonly logger = new Logger(ExercisePlacementCache.name);
  private readonly ttl: number;

  constructor(
    private readonly redis: RedisService,
    config: ConfigService<AppConfig>,
  ) {
    this.ttl = config.get<AppConfig['cache']>('cache')!.exercisePlacementTtlSeconds;
  }

  private cacheKey(exerciseId: string): string {
    return `exercise-placement:${exerciseId}`;
  }

  async get(exerciseId: string): Promise<ExercisePlacement | null> {
    const client = this.redis.getClient();
    if (!client) return null;

    const raw = await client.get(this.cacheKey(exerciseId));
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as ExercisePlacement;
    } catch {
      this.logger.warn(`Failed to parse cached placement for exercise ${exerciseId}`);
      return null;
    }
  }

  async set(exerciseId: string, value: ExercisePlacement): Promise<void> {
    const client = this.redis.getClient();
    if (!client) return;

    await client.set(this.cacheKey(exerciseId), JSON.stringify(value), 'EX', this.ttl);
  }
}
