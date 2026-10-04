import type { ReviewCard, SrsContentType } from '../entities/review-card.entity.js';
import type { SrsTrack } from '../value-objects/srs-track.js';

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
  /** Due cards, narrowed to one memory when the caller names a track (plan 63 phase 6). */
  findDueCards(
    userId: string,
    limit: number,
    now: Date,
    track?: SrsTrack,
  ): Promise<ReviewCard[]>;
  save(card: ReviewCard): Promise<void>;
  countNewToday(userId: string, since: Date): Promise<number>;
  countReviewedToday(userId: string, since: Date): Promise<number>;
  getStatsByUser(userId: string, now: Date): Promise<SrsStats>;
  // Returns the count of consecutive days (ending today) on which the user
  // reviewed at least one card. Uses lastReviewedAt to walk backwards.
  getStreakDays(userId: string, now: Date): Promise<number>;
  /**
   * Deletes every learner's `EXERCISE_GAP` card on this exercise whose piece is not among
   * `keepKeys` — the piece was deleted and nothing will rate it again (plan 68). Returns the
   * learners who lost a card, so their cached due queues can be dropped.
   */
  deleteGapCardsExcept(exerciseId: string, keepKeys: readonly string[]): Promise<string[]>;
}
