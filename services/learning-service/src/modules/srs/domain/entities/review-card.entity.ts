import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { ReviewRating } from '../value-objects/review-rating.vo.js';
import { CardSuspendedError, type SrsDomainError } from '../exceptions/srs.errors.js';
import { ReviewCardCreatedEvent } from '../events/review-card-created.event.js';
import { ReviewCardReviewedEvent } from '../events/review-card-reviewed.event.js';
import { ReviewCardSuspendedEvent } from '../events/review-card-suspended.event.js';

export type SrsContentType = 'EXERCISE' | 'VOCABULARY_WORD';

// Mirrors FSRS State enum (New=0, Learning=1, Review=2, Relearning=3) plus our own Suspended.
export type ReviewCardState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'SUSPENDED';

export interface SchedulingResult {
  state: ReviewCardState;
  dueAt: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  // ts-fsrs v5 internal: current position in the learning/relearning steps array.
  learningSteps: number;
}

export interface ReviewCardPersistenceProps {
  id: string;
  userId: string;
  contentType: SrsContentType;
  contentId: string;
  state: ReviewCardState;
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
}

export class ReviewCard extends AggregateRoot {
  private constructor(
    id: string,
    private _userId: string,
    private _contentType: SrsContentType,
    private _contentId: string,
    private _state: ReviewCardState,
    private _dueAt: Date,
    private _stability: number,
    private _difficulty: number,
    private _elapsedDays: number,
    private _scheduledDays: number,
    private _reps: number,
    private _lapses: number,
    private _learningSteps: number,
    private _lastReviewedAt: Date | null,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
  ) {
    super(id);
  }

  static create(
    userId: string,
    contentType: SrsContentType,
    contentId: string,
    now: Date,
  ): ReviewCard {
    const card = new ReviewCard(
      randomUUID(),
      userId,
      contentType,
      contentId,
      'NEW',
      now,   // due immediately — first review happens on introduction
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      null,
      now,
      now,
    );
    card.addDomainEvent(new ReviewCardCreatedEvent(card.id, {
      userId,
      contentType,
      contentId,
      dueAt: now.toISOString(),
    }));
    return card;
  }

  static reconstitute(props: ReviewCardPersistenceProps): ReviewCard {
    return new ReviewCard(
      props.id,
      props.userId,
      props.contentType,
      props.contentId,
      props.state,
      props.dueAt,
      props.stability,
      props.difficulty,
      props.elapsedDays,
      props.scheduledDays,
      props.reps,
      props.lapses,
      props.learningSteps,
      props.lastReviewedAt,
      props.createdAt,
      props.updatedAt,
    );
  }

  review(
    rating: ReviewRating,
    result: SchedulingResult,
    reviewedAt: Date,
  ): Result<void, SrsDomainError> {
    if (this._state === 'SUSPENDED') {
      return Result.fail(new CardSuspendedError());
    }

    const previousState = this._state;

    this._state = result.state;
    this._dueAt = result.dueAt;
    this._stability = result.stability;
    this._difficulty = result.difficulty;
    this._elapsedDays = result.elapsedDays;
    this._scheduledDays = result.scheduledDays;
    this._learningSteps = result.learningSteps;
    this._reps += 1;

    // A lapse is a REVIEW-state card rated AGAIN (falling back to relearning).
    if (previousState === 'REVIEW' && rating.value === 'AGAIN') {
      this._lapses += 1;
    }

    this._lastReviewedAt = reviewedAt;
    this._updatedAt = reviewedAt;

    this.addDomainEvent(new ReviewCardReviewedEvent(this.id, {
      userId: this._userId,
      contentType: this._contentType,
      contentId: this._contentId,
      rating: rating.value,
      newState: this._state,
      newDueAt: this._dueAt.toISOString(),
      scheduledDays: this._scheduledDays,
      reviewedAt: reviewedAt.toISOString(),
    }));

    return Result.ok();
  }

  suspend(now: Date): void {
    this._state = 'SUSPENDED';
    this._updatedAt = now;
    this.addDomainEvent(new ReviewCardSuspendedEvent(this.id, {
      userId: this._userId,
      contentType: this._contentType,
      contentId: this._contentId,
      suspended: true,
    }));
  }

  unsuspend(now: Date): void {
    // Restore to REVIEW so the card appears in the due queue immediately.
    this._state = 'REVIEW';
    this._dueAt = now;
    this._updatedAt = now;
    this.addDomainEvent(new ReviewCardSuspendedEvent(this.id, {
      userId: this._userId,
      contentType: this._contentType,
      contentId: this._contentId,
      suspended: false,
    }));
  }

  get userId(): string { return this._userId; }
  get contentType(): SrsContentType { return this._contentType; }
  get contentId(): string { return this._contentId; }
  get state(): ReviewCardState { return this._state; }
  get dueAt(): Date { return this._dueAt; }
  get stability(): number { return this._stability; }
  get difficulty(): number { return this._difficulty; }
  get elapsedDays(): number { return this._elapsedDays; }
  get scheduledDays(): number { return this._scheduledDays; }
  get reps(): number { return this._reps; }
  get lapses(): number { return this._lapses; }
  get learningSteps(): number { return this._learningSteps; }
  get lastReviewedAt(): Date | null { return this._lastReviewedAt; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
}
