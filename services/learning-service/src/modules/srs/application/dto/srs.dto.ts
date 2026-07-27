import type { ReviewCard } from '../../domain/entities/review-card.entity.js';
import type { SrsStats } from '../../domain/repositories/srs-repository.interface.js';
import type { PredictedInterval } from '../ports/srs-scheduler.port.js';
import type { VocabularyItemDisplayRef } from '../../../../shared/application/ports/content-client.port.js';

/**
 * Renderable content for a VOCABULARY_WORD card, resolved from Content Service.
 * A card itself carries only `contentId`, and no client can turn that into a
 * word on its own (the public item route is nested under a list id the card
 * does not know), so the composition happens here — once, for every client.
 * Null on EXERCISE cards and whenever the lookup fails; never blocks the queue.
 */
export interface ReviewCardFrontDto {
  word: string;
  partOfSpeech: string | null;
  ipaTranscription: string | null;
  audioMediaId: string | null;
  listId: string;
}

export interface ReviewCardBackDto {
  translation: string | null;
  alternativeTranslations: string[];
  definition: string | null;
  usageNotes: string | null;
  translationLanguage: string | null;
  /** True when the translation came from a fallback language. */
  fallbackUsed: boolean;
  /** True when no usable translation exists — show the target language only. */
  immersionMode: boolean;
  examples: Array<{ text: string; translation: string | null; audioMediaId: string | null }>;
}

export interface ReviewCardDto {
  id: string;
  userId: string;
  contentType: string;
  contentId: string;
  state: string;
  dueAt: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  predicted: PredictedInterval[];
  front?: ReviewCardFrontDto | null;
  back?: ReviewCardBackDto | null;
}

export function toVocabularyCardContent(item: VocabularyItemDisplayRef): {
  front: ReviewCardFrontDto;
  back: ReviewCardBackDto;
} {
  return {
    front: {
      word: item.word,
      partOfSpeech: item.partOfSpeech,
      ipaTranscription: item.ipaTranscription,
      audioMediaId: item.pronunciationAudioMediaId,
      listId: item.listId,
    },
    back: {
      translation: item.translation?.primaryTranslation ?? null,
      alternativeTranslations: item.translation?.alternativeTranslations ?? [],
      definition: item.translation?.definition ?? null,
      usageNotes: item.translation?.usageNotes ?? null,
      translationLanguage: item.translation?.language ?? null,
      fallbackUsed: item.translation?.fallbackUsed ?? false,
      immersionMode: item.immersionMode,
      examples: item.examples.map((ex) => ({
        text: ex.exampleText,
        translation: ex.translation?.translatedText ?? null,
        audioMediaId: ex.audioMediaId,
      })),
    },
  };
}

export interface SrsStatsDto {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
  suspendedCount: number;
  dueNowCount: number;
  reviewedTodayCount: number;
}

export function toReviewCardDto(card: ReviewCard, predicted: PredictedInterval[] = []): ReviewCardDto {
  return {
    id: card.id,
    userId: card.userId,
    contentType: card.contentType,
    contentId: card.contentId,
    state: card.state,
    dueAt: card.dueAt.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt: card.lastReviewedAt?.toISOString() ?? null,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    predicted,
  };
}

export function toSrsStatsDto(stats: SrsStats): SrsStatsDto {
  return { ...stats };
}

export interface DueCardsEnvelope {
  cards: ReviewCardDto[];
  reviewedToday: number;
  dailyLimit: number;
  streakDays: number;
}
