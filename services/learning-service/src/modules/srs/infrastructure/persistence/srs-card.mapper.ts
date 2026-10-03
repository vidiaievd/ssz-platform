import {
  ReviewCard,
  type ReviewCardState,
  type SrsContentType,
} from '../../domain/entities/review-card.entity.js';
import type { SrsTrack } from '../../domain/value-objects/srs-track.js';

type PrismaSrsReviewCard = {
  id: string;
  userId: string;
  contentType: string;
  contentId: string;
  track: string;
  state: string;
  dueAt: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  learningSteps: number;
  lastReviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The track as Prisma spells it.
 *
 * The domain says `lexis`, the Redis budget keys say `lexis`, the wire says `lexis` —
 * and a Prisma enum is addressed by its *member name*, never by its `@map` value, so a
 * lowercase value cast through would compile and then fail at runtime. Converted here,
 * at the only boundary that cares.
 */
export function toPrismaTrack(track: SrsTrack): 'LEXIS' | 'GRAMMAR' {
  return track === 'grammar' ? 'GRAMMAR' : 'LEXIS';
}

function toDomainTrack(value: string): SrsTrack {
  return value === 'GRAMMAR' || value === 'grammar' ? 'grammar' : 'lexis';
}

export class SrsCardMapper {
  static toDomain(row: PrismaSrsReviewCard): ReviewCard {
    return ReviewCard.reconstitute({
      id: row.id,
      userId: row.userId,
      contentType: row.contentType as SrsContentType,
      contentId: row.contentId,
      track: toDomainTrack(row.track),
      state: row.state as ReviewCardState,
      dueAt: row.dueAt,
      stability: row.stability,
      difficulty: row.difficulty,
      elapsedDays: row.elapsedDays,
      scheduledDays: row.scheduledDays,
      reps: row.reps,
      lapses: row.lapses,
      learningSteps: row.learningSteps,
      lastReviewedAt: row.lastReviewedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  static toPersistence(card: ReviewCard) {
    return {
      id: card.id,
      userId: card.userId,
      contentType: card.contentType,
      contentId: card.contentId,
      track: toPrismaTrack(card.track),
      state: card.state,
      dueAt: card.dueAt,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      learningSteps: card.learningSteps,
      lastReviewedAt: card.lastReviewedAt,
    };
  }
}
