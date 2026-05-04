import {
  ReviewCard,
  type ReviewCardState,
  type SrsContentType,
} from '../../domain/entities/review-card.entity.js';

type PrismaSrsReviewCard = {
  id: string;
  userId: string;
  contentType: string;
  contentId: string;
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

export class SrsCardMapper {
  static toDomain(row: PrismaSrsReviewCard): ReviewCard {
    return ReviewCard.reconstitute({
      id: row.id,
      userId: row.userId,
      contentType: row.contentType as SrsContentType,
      contentId: row.contentId,
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
