import type { ReviewCard } from '../../domain/entities/review-card.entity.js';
import type { SrsStats } from '../../domain/repositories/srs-repository.interface.js';

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

export function toReviewCardDto(card: ReviewCard): ReviewCardDto {
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
  };
}

export function toSrsStatsDto(stats: SrsStats): SrsStatsDto {
  return { ...stats };
}
