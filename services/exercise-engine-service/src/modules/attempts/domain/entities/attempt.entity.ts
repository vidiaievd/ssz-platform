import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { Score } from '../value-objects/score.vo.js';
import {
  AttemptAlreadySubmittedError,
  InvalidAttemptTransitionError,
  InvalidScoreError,
} from '../exceptions/attempt.errors.js';
import { AttemptStartedEvent } from '../events/attempt-started.event.js';
import { AttemptScoredEvent } from '../events/attempt-scored.event.js';
import { AttemptRoutedForReviewEvent } from '../events/attempt-routed-for-review.event.js';

export type AttemptStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'SCORED'
  | 'ROUTED_FOR_REVIEW'
  | 'ABANDONED';

export type DifficultyLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface CreateAttemptProps {
  userId: string;
  exerciseId: string;
  assignmentId?: string | null;
  enrollmentId?: string | null;
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
}

export interface AttemptPersistenceProps {
  id: string;
  userId: string;
  exerciseId: string;
  assignmentId: string | null;
  enrollmentId: string | null;
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  status: AttemptStatus;
  score: number | null;
  passed: boolean | null;
  timeSpentSeconds: number;
  submittedAnswer: unknown;
  validationDetails: unknown;
  feedback: unknown;
  answerHash: string | null;
  revisionCount: number;
  startedAt: Date;
  submittedAt: Date | null;
  scoredAt: Date | null;
}

export class Attempt extends AggregateRoot {
  private constructor(
    id: string,
    private _userId: string,
    private _exerciseId: string,
    private _assignmentId: string | null,
    private _enrollmentId: string | null,
    private _templateCode: string,
    private _targetLanguage: string,
    private _difficultyLevel: DifficultyLevel,
    private _status: AttemptStatus,
    private _score: number | null,
    private _passed: boolean | null,
    private _timeSpentSeconds: number,
    private _submittedAnswer: unknown,
    private _validationDetails: unknown,
    private _feedback: unknown,
    private _answerHash: string | null,
    private _revisionCount: number,
    private _startedAt: Date,
    private _submittedAt: Date | null,
    private _scoredAt: Date | null,
  ) {
    super(id);
  }

  static create(props: CreateAttemptProps): Attempt {
    const attempt = new Attempt(
      randomUUID(),
      props.userId,
      props.exerciseId,
      props.assignmentId ?? null,
      props.enrollmentId ?? null,
      props.templateCode,
      props.targetLanguage,
      props.difficultyLevel,
      'IN_PROGRESS',
      null,
      null,
      0,
      null,
      null,
      null,
      null,
      0,
      new Date(),
      null,
      null,
    );

    attempt.addDomainEvent(
      new AttemptStartedEvent(attempt.id, {
        userId: attempt._userId,
        exerciseId: attempt._exerciseId,
        templateCode: attempt._templateCode,
        targetLanguage: attempt._targetLanguage,
        assignmentId: attempt._assignmentId,
        enrollmentId: attempt._enrollmentId,
      }),
    );

    return attempt;
  }

  static reconstitute(props: AttemptPersistenceProps): Attempt {
    return new Attempt(
      props.id,
      props.userId,
      props.exerciseId,
      props.assignmentId,
      props.enrollmentId,
      props.templateCode,
      props.targetLanguage,
      props.difficultyLevel,
      props.status,
      props.score,
      props.passed,
      props.timeSpentSeconds,
      props.submittedAnswer,
      props.validationDetails,
      props.feedback,
      props.answerHash,
      props.revisionCount,
      props.startedAt,
      props.submittedAt,
      props.scoredAt,
    );
  }

  submit(
    answer: unknown,
    answerHash: string,
  ): Result<void, AttemptAlreadySubmittedError | InvalidAttemptTransitionError> {
    if (this._status === 'SUBMITTED') {
      return Result.fail(new AttemptAlreadySubmittedError());
    }
    if (this._status !== 'IN_PROGRESS') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot submit attempt with status ${this._status}`,
        ),
      );
    }

    this._submittedAnswer = answer;
    this._answerHash = answerHash;
    this._submittedAt = new Date();
    this._status = 'SUBMITTED';

    return Result.ok();
  }

  score(
    rawScore: number,
    passed: boolean,
    validationDetails: unknown,
    feedback: unknown,
  ): Result<void, InvalidScoreError | InvalidAttemptTransitionError> {
    if (this._status !== 'SUBMITTED') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot score attempt with status ${this._status}`,
        ),
      );
    }

    const scoreResult = Score.create(rawScore);
    if (scoreResult.isFail) {
      return Result.fail(scoreResult.error);
    }

    this._score = scoreResult.value.value;
    this._passed = passed;
    this._validationDetails = validationDetails;
    this._feedback = feedback;
    this._scoredAt = new Date();
    this._status = 'SCORED';

    this.addDomainEvent(
      new AttemptScoredEvent(this.id, {
        userId: this._userId,
        exerciseId: this._exerciseId,
        score: this._score,
        timeSpentSeconds: this._timeSpentSeconds,
        completed: true,
      }),
    );

    return Result.ok();
  }

  routeForReview(): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'SUBMITTED') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot route attempt with status ${this._status} for review`,
        ),
      );
    }

    this._status = 'ROUTED_FOR_REVIEW';

    this.addDomainEvent(
      new AttemptRoutedForReviewEvent(this.id, {
        userId: this._userId,
        exerciseId: this._exerciseId,
        score: null,
        timeSpentSeconds: this._timeSpentSeconds,
        completed: false,
      }),
    );

    return Result.ok();
  }

  // Idempotent: abandoning an already-abandoned attempt is a no-op.
  abandon(details?: unknown): Result<void, InvalidAttemptTransitionError> {
    if (this._status === 'ABANDONED') {
      return Result.ok();
    }
    if (this._status === 'SCORED' || this._status === 'ROUTED_FOR_REVIEW') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot abandon attempt with status ${this._status}`,
        ),
      );
    }

    this._status = 'ABANDONED';
    if (details !== undefined) {
      this._validationDetails = details;
    }
    return Result.ok();
  }

  addTimeSpent(seconds: number): void {
    if (seconds > 0) {
      this._timeSpentSeconds += seconds;
    }
  }

  get userId(): string { return this._userId; }
  get exerciseId(): string { return this._exerciseId; }
  get assignmentId(): string | null { return this._assignmentId; }
  get enrollmentId(): string | null { return this._enrollmentId; }
  get templateCode(): string { return this._templateCode; }
  get targetLanguage(): string { return this._targetLanguage; }
  get difficultyLevel(): DifficultyLevel { return this._difficultyLevel; }
  get status(): AttemptStatus { return this._status; }
  get scoreValue(): number | null { return this._score; }
  get passed(): boolean | null { return this._passed; }
  get timeSpentSeconds(): number { return this._timeSpentSeconds; }
  get submittedAnswer(): unknown { return this._submittedAnswer; }
  get validationDetails(): unknown { return this._validationDetails; }
  get feedback(): unknown { return this._feedback; }
  get answerHash(): string | null { return this._answerHash; }
  get revisionCount(): number { return this._revisionCount; }
  get startedAt(): Date { return this._startedAt; }
  get submittedAt(): Date | null { return this._submittedAt; }
  get scoredAt(): Date | null { return this._scoredAt; }
}
