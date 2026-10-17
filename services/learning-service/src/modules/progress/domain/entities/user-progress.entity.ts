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

/**
 * `SUBMITTED` (plan 76, 2.6): handed to a teacher and not judged yet. Not `COMPLETED` — a
 * returned piece of work was showing «Done» until it was approved — and not `IN_PROGRESS`
 * either: the learner has done their part, and the course does not hold them back for it.
 */
export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED' | 'NEEDS_REVIEW';

export interface RecordAttemptProps {
  timeSpentSeconds: number;
  score: number | null;
  /**
   * Done, for this content: read, for a lesson; passed or approved, for an exercise. An
   * exercise failed by the machine is an attempt and not a completion (plan 76, Q2-A).
   */
  completed: boolean;
  /** Handed to a teacher and waiting for their verdict. Ignored together with `completed`. */
  awaitingReview?: boolean;
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
    this._timeSpentSeconds += props.timeSpentSeconds;

    // The score is the latest attempt's, by when it was made rather than when it arrived: an
    // attempt worked offline on Monday and synced on Wednesday must not overwrite the one
    // made online on Tuesday (VoxOrd offline plan, B4).
    const latest = this._lastAttemptAt === null || props.now >= this._lastAttemptAt;
    if (latest) {
      this._lastAttemptAt = props.now;
      if (props.score !== null) this._score = props.score;
    }

    const isFirstCompletion = props.completed && !this._completedAt;

    // Once passed, always passed: a later failure is practice on something already done,
    // and it moves the score, not the status (plan 76, Q2-A).
    if (props.completed && this._status !== 'NEEDS_REVIEW') {
      this._completedAt = this._completedAt ?? props.now;
      this._status = 'COMPLETED';
    } else if (
      props.awaitingReview === true &&
      (this._status === 'NOT_STARTED' || this._status === 'IN_PROGRESS')
    ) {
      this._status = 'SUBMITTED';
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

  /**
   * A teacher sent the submission back (plan 76, 2.6). Not an attempt — the submission was
   * counted when it was handed in — so neither the counters nor the score move: the
   * teacher's partial credit is not a mark the learner earned. Only a submission waiting
   * for a verdict goes back to work; something already passed stays passed.
   */
  recordReturn(): void {
    if (this._status !== 'SUBMITTED') return;
    this._status = 'IN_PROGRESS';
    this.addDomainEvent(new ProgressUpdatedEvent(this.id, {
      userId: this._userId,
      contentType: this._contentRef.type,
      contentId: this._contentRef.id,
      status: this._status,
      attemptsCount: this._attemptsCount,
      score: this._score,
    }));
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
    if (approved) {
      this._completedAt = this._completedAt ?? now;
      this.addDomainEvent(new ProgressCompletedEvent(this.id, {
        userId: this._userId,
        contentType: this._contentRef.type,
        contentId: this._contentRef.id,
        completedAt: this._completedAt.toISOString(),
        score: this._score,
      }));
    }
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
