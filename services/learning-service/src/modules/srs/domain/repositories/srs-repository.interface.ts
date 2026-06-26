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
  // Batch lookup for mastery roll-ups (plan 21 §2.1/§2.2) — avoids N+1 queries
  // when aggregating over dozens of atoms reachable through ContentRelation.
  findByUserAndContents(
    userId: string,
    contentType: SrsContentType,
    contentIds: string[],
  ): Promise<ReviewCard[]>;
  findDueCards(userId: string, limit: number, now: Date): Promise<ReviewCard[]>;
  save(card: ReviewCard): Promise<void>;
  countNewToday(userId: string, since: Date): Promise<number>;
  countReviewedToday(userId: string, since: Date): Promise<number>;
  getStatsByUser(userId: string, now: Date): Promise<SrsStats>;
}
