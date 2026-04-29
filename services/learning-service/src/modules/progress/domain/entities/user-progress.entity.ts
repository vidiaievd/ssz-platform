import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { ContentRef } from '../../../../shared/domain/value-objects/content-ref.js';
import { Result } from '../../../../shared/kernel/result.js';
import {
  ProgressNotCompletedError,
  ProgressNotUnderReviewError,
  type ProgressDomainError,
} from '../exceptions/progress.errors.js';
import { ProgressUpdatedEvent } from '../events/progress-updated.event.js';
import { ProgressCompletedEvent } from '../events/progress-completed.event.js';

export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'NEEDS_REVIEW';

export interface RecordAttemptProps {
  timeSpentSeconds: number;
  score: number | null;
  completed: boolean;
  now: Date;
}

export interface ProgressPersistenceProps {
  id: string;
  userId: string;
  contentType: string;
  contentId: string;
  status: ProgressStatus;
  attemptsCount: number;
  lastAttemptAt: Date | null;
  timeSpentSeconds: number;
  score: number | null;
  completedAt: Date | null;
  needsReviewSince: Date | null;
  reviewResolvedAt: Date | null;
}

export class UserProgress extends AggregateRoot {
  private constructor(
    id: string,
    private _userId: string,
    private _contentRef: ContentRef,
    private _status: ProgressStatus,
    private _attemptsCount: number,
    private _lastAttemptAt: Date | null,
    private _timeSpentSeconds: number,
    private _score: number | null,
    private _completedAt: Date | null,
    private _needsReviewSince: Date | null,
    private _reviewResolvedAt: Date | null,
  ) {
    super(id);
  }

  static create(userId: string, contentRef: ContentRef): UserProgress {
    return new UserProgress(
      randomUUID(),
      userId,
      contentRef,
      'NOT_STARTED',
      0,
      null,
      0,
      null,
      null,
      null,
      null,
    );
  }

  static reconstitute(props: ProgressPersistenceProps): UserProgress {
    return new UserProgress(
      props.id,
      props.userId,
      ContentRef.fromPersistence(props.contentType, props.contentId),
      props.status,
      props.attemptsCount,
      props.lastAttemptAt,
      props.timeSpentSeconds,
      props.score,
      props.completedAt,
      props.needsReviewSince,
      props.reviewResolvedAt,
    );
  }

  recordAttempt(props: RecordAttemptProps): void {
    this._attemptsCount += 1;
    this._lastAttemptAt = props.now;
    this._timeSpentSeconds += props.timeSpentSeconds;

    if (props.score !== null) {
      this._score = props.score;
    }

    const isFirstCompletion = props.completed && !this._completedAt;

    if (props.completed && this._status !== 'NEEDS_REVIEW') {
      this._completedAt = this._completedAt ?? props.now;
      this._status = 'COMPLETED';
    } else if (this._status === 'NOT_STARTED') {
      this._status = 'IN_PROGRESS';
    }

    if (isFirstCompletion) {
      this.addDomainEvent(new ProgressCompletedEvent(this.id, {
        userId: this._userId,
        contentType: this._contentRef.type,
        contentId: this._contentRef.id,
        completedAt: this._completedAt!.toISOString(),
        score: this._score,
      }));
    } else {
      this.addDomainEvent(new ProgressUpdatedEvent(this.id, {
        userId: this._userId,
        contentType: this._contentRef.type,
        contentId: this._contentRef.id,
        status: this._status,
        attemptsCount: this._attemptsCount,
        score: this._score,
      }));
    }
  }

  markNeedsReview(now: Date): Result<void, ProgressDomainError> {
    if (this._status !== 'COMPLETED') {
      return Result.fail(new ProgressNotCompletedError());
    }
    this._status = 'NEEDS_REVIEW';
    this._needsReviewSince = now;
    return Result.ok();
  }

  resolveReview(approved: boolean, now: Date): Result<void, ProgressDomainError> {
    if (this._status !== 'NEEDS_REVIEW') {
      return Result.fail(new ProgressNotUnderReviewError());
    }
    this._reviewResolvedAt = now;
    this._status = approved ? 'COMPLETED' : 'IN_PROGRESS';
    return Result.ok();
  }

  get userId(): string { return this._userId; }
  get contentRef(): ContentRef { return this._contentRef; }
  get status(): ProgressStatus { return this._status; }
  get attemptsCount(): number { return this._attemptsCount; }
  get lastAttemptAt(): Date | null { return this._lastAttemptAt; }
  get timeSpentSeconds(): number { return this._timeSpentSeconds; }
  get score(): number | null { return this._score; }
  get completedAt(): Date | null { return this._completedAt; }
  get needsReviewSince(): Date | null { return this._needsReviewSince; }
  get reviewResolvedAt(): Date | null { return this._reviewResolvedAt; }
}
