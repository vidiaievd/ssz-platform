import { QueryHandler, IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { BatchGetVocabularyItemsForDisplayQuery } from './batch-get-vocabulary-items-for-display.query.js';
import { Result } from '../../../../../shared/kernel/result.js';
import { VocabularyDomainError } from '../../../domain/exceptions/vocabulary-domain.exceptions.js';
import { VocabularyItemEntity } from '../../../domain/entities/vocabulary-item.entity.js';
import { VocabularyUsageExampleEntity } from '../../../domain/entities/vocabulary-usage-example.entity.js';
import { VOCABULARY_ITEM_REPOSITORY } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import type { IVocabularyItemRepository } from '../../../domain/repositories/vocabulary-item.repository.interface.js';
import { TranslationFallbackSelectorService } from '../../../domain/services/translation-fallback-selector.service.js';
import {
  VocabularyDisplayCacheService,
  DisplayOpts,
} from '../../../infrastructure/cache/vocabulary-display-cache.service.js';
import type {
  VocabularyItemDisplayResult,
  ItemTranslationDisplayResult,
  ExampleDisplayResult,
} from '../../dto/vocabulary-item-display-result.js';

/** Maximum number of item IDs accepted in a single batch request. */
const MAX_BATCH_SIZE = 200;

@QueryHandler(BatchGetVocabularyItemsForDisplayQuery)
export class BatchGetVocabularyItemsForDisplayHandler implements IQueryHandler<
  BatchGetVocabularyItemsForDisplayQuery,
  Result<VocabularyItemDisplayResult[], VocabularyDomainError>
> {
  constructor(
    @Inject(VOCABULARY_ITEM_REPOSITORY)
    private readonly itemRepo: IVocabularyItemRepository,
    private readonly fallbackSelector: TranslationFallbackSelectorService,
    private readonly cacheService: VocabularyDisplayCacheService,
  ) {}

  async execute(
    query: BatchGetVocabularyItemsForDisplayQuery,
  ): Promise<Result<VocabularyItemDisplayResult[], VocabularyDomainError>> {
    if (query.vocabularyItemIds.length > MAX_BATCH_SIZE) {
      return Result.fail(VocabularyDomainError.BATCH_SIZE_EXCEEDED);
    }

    if (query.vocabularyItemIds.length === 0) {
      return Result.ok([]);
    }

    const opts: DisplayOpts = {
      translationLanguage: query.translationLanguage,
      includeExamples: query.includeExamples,
      examplesLimit: query.examplesLimit,
      examplesRandom: query.examplesRandom,
      studentKnownLanguages: query.studentKnownLanguages,
    };

    // Check cache for each item; collect misses
    const resultMap = new Map<string, VocabularyItemDisplayResult>();
    const missIds: string[] = [];

    await Promise.all(
      query.vocabularyItemIds.map(async (id) => {
        const cached = await this.cacheService.get(id, opts);
        if (cached) {
          resultMap.set(id, cached as unknown as VocabularyItemDisplayResult);
        } else {
          missIds.push(id);
        }
      }),
    );

    // Fetch all cache misses in a single query
    if (missIds.length > 0) {
      const items = await this.itemRepo.findByIds(missIds, true);

      await Promise.all(
        items
          .filter((item) => item.deletedAt === null)
          .map(async (item) => {
            const displayResult = this.buildDisplayResult(item, opts);
            resultMap.set(item.id, displayResult);
            await this.cacheService.set(
              item.id,
              opts,
              displayResult as unknown as Record<string, unknown>,
            );
          }),
      );
    }

    // Return results in input order; items not found (deleted/missing) are omitted
    const ordered = query.vocabularyItemIds
      .map((id) => resultMap.get(id))
      .filter((r): r is VocabularyItemDisplayResult => r !== undefined);

    return Result.ok(ordered);
  }

  private buildDisplayResult(
    item: VocabularyItemEntity,
    opts: DisplayOpts,
  ): VocabularyItemDisplayResult {
    const translationSelection = this.fallbackSelector.select({
      translations: item.translations,
      studentNativeLanguage: opts.translationLanguage,
      studentKnownLanguages: opts.studentKnownLanguages,
      targetLanguage: item.vocabularyListId,
    });

    const translation: ItemTranslationDisplayResult | null = translationSelection.translation
      ? {
          id: translationSelection.translation.id,
          language: translationSelection.translation.translationLanguage,
          primaryTranslation: translationSelection.translation.primaryTranslation,
          alternativeTranslations: translationSelection.translation.alternativeTranslations,
          definition: translationSelection.translation.definition,
          usageNotes: translationSelection.translation.usageNotes,
          falseFriendWarning: translationSelection.translation.falseFriendWarning,
          fallbackUsed: translationSelection.fallbackUsed,
        }
      : null;

    let examples: ExampleDisplayResult[] = [];
    if (opts.includeExamples) {
      const exampleEntities = [...item.usageExamples];

      if (opts.examplesRandom) {
        // Fisher-Yates shuffle
        for (let i = exampleEntities.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [exampleEntities[i], exampleEntities[j]] = [exampleEntities[j], exampleEntities[i]];
        }
      }

      examples = exampleEntities
        .slice(0, opts.examplesLimit)
        .map((ex) => this.buildExampleDisplayResult(ex, opts));
    }

    return {
      itemId: item.id,
      listId: item.vocabularyListId,
      word: item.word,
      position: item.position,
      partOfSpeech: item.partOfSpeech,
      ipaTranscription: item.ipaTranscription,
      pronunciationAudioMediaId: item.pronunciationAudioMediaId,
      grammaticalProperties: item.grammaticalProperties,
      register: item.register,
      notes: item.notes,
      translation,
      immersionMode: translationSelection.immersionMode,
      examples,
    };
  }

  private buildExampleDisplayResult(
    ex: VocabularyUsageExampleEntity,
    opts: DisplayOpts,
  ): ExampleDisplayResult {
    const exTranslationSelection = this.fallbackSelector.select({
      translations: ex.translations,
      studentNativeLanguage: opts.translationLanguage,
      studentKnownLanguages: opts.studentKnownLanguages,
      targetLanguage: '',
    });

    return {
      id: ex.id,
      exampleText: ex.exampleText,
      position: ex.position,
      audioMediaId: ex.audioMediaId,
      contextNote: ex.contextNote,
      translation: exTranslationSelection.translation
        ? {
            id: exTranslationSelection.translation.id,
            language: exTranslationSelection.translation.translationLanguage,
            translatedText: exTranslationSelection.translation.translatedText,
            fallbackUsed: exTranslationSelection.fallbackUsed,
          }
        : null,
      immersionMode: exTranslationSelection.immersionMode,
    };
  }
}
