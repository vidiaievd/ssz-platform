import { Injectable, Inject } from '@nestjs/common';
import { CACHE_SERVICE } from '../../../../shared/application/ports/cache.port.js';
import type { ICacheService } from '../../../../shared/application/ports/cache.port.js';

/**
 * Options that influence how a display result is built and cached.
 * These fields are all part of the cache key so that different option combinations
 * are stored independently.
 */
export interface DisplayOpts {
  translationLanguage: string;
  includeExamples: boolean;
  examplesLimit: number;
  /** When true, examples are chosen randomly — result is NOT cached (non-deterministic). */
  examplesRandom: boolean;
  /**
   * Student's known languages affect which fallback translation is chosen.
   * Included in the key so different user-language profiles get separate cache entries.
   */
  studentKnownLanguages: string[];
}

// Import shape only — avoids a circular dependency with presentation layer.
// The cache stores plain JSON, so any serializable DTO works here.
export type VocabularyItemDisplayDto = Record<string, unknown>;

@Injectable()
export class VocabularyDisplayCacheService {
  /** 15 minutes — matches the architecture specification. */
  private readonly TTL_SECONDS = 15 * 60;

  constructor(@Inject(CACHE_SERVICE) private readonly cache: ICacheService) {}

  /**
   * Key pattern: vocab:display:{itemId}:{translationLanguage}:{includeExamples}:
   *              {examplesLimit}:{sortedKnownLanguages}
   *
   * Known languages are sorted alphabetically before joining so that
   * ["ru","de"] and ["de","ru"] resolve to the same cache entry (same fallback behaviour).
   */
  private buildKey(itemId: string, opts: DisplayOpts): string {
    const knownLangs = [...opts.studentKnownLanguages].sort().join(',');
    return [
      'vocab:display',
      itemId,
      opts.translationLanguage,
      opts.includeExamples ? '1' : '0',
      opts.examplesLimit,
      knownLangs || '_',
    ].join(':');
  }

  async get(itemId: string, opts: DisplayOpts): Promise<VocabularyItemDisplayDto | null> {
    // Random example selection is non-deterministic — never serve from cache.
    if (opts.examplesRandom) return null;
    return this.cache.get<VocabularyItemDisplayDto>(this.buildKey(itemId, opts));
  }

  async set(itemId: string, opts: DisplayOpts, value: VocabularyItemDisplayDto): Promise<void> {
    // Random example selection is non-deterministic — never write to cache.
    if (opts.examplesRandom) return;
    await this.cache.set(this.buildKey(itemId, opts), value, this.TTL_SECONDS);
  }

  /**
   * Invalidates all cached display entries for a single item regardless of opts.
   * Called whenever the item, any of its translations, examples, or example
   * translations are mutated.
   */
  async invalidateItem(itemId: string): Promise<void> {
    await this.cache.deleteByPattern(`vocab:display:${itemId}:*`);
  }

  /**
   * Bulk invalidation for all items in a list.
   * Called when an entire vocabulary list or a reorder operation affects multiple items.
   */
  async invalidateList(listId: string, itemIds: string[]): Promise<void> {
    // listId is accepted for logging / future use but invalidation acts on item keys.
    void listId;
    await Promise.all(itemIds.map((id) => this.invalidateItem(id)));
  }
}
