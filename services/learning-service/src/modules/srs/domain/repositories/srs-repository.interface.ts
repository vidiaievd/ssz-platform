import type { ReviewCard, SrsContentType } from '../entities/review-card.entity.js';

export interface SrsStats {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  relearningCount: number;
  suspendedCount: number;
  dueNowCount: number;
  reviewedTodayCount: number;
}

export const SRS_REPOSITORY = Symbol('ISrsRepository');

export interface ISrsRepository {
  findById(id: string): Promise<ReviewCard | null>;
  findByUserAndContent(
    userId: string,
    contentType: SrsContentType,
    contentId: string,
  ): Promise<ReviewCard | null>;
  findDueCards(userId: string, limit: number, now: Date): Promise<ReviewCard[]>;
  save(card: ReviewCard): Promise<void>;
  countNewToday(userId: string, since: Date): Promise<number>;
  countReviewedToday(userId: string, since: Date): Promise<number>;
  getStatsByUser(userId: string, now: Date): Promise<SrsStats>;
}
