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
import type { AnswerForm } from '@ssz/contracts';
import { AttemptScoredEvent } from '../events/attempt-scored.event.js';
import { AttemptRoutedForReviewEvent } from '../events/attempt-routed-for-review.event.js';

export type AttemptStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'SCORED'
  | 'ROUTED_FOR_REVIEW'
  | 'ABANDONED';

export type DifficultyLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// PRACTICE: expectedAnswers shipped to the client for instant local checking.
// GRADED: expectedAnswers withheld; the correct answer is never revealed in feedback either.
export type CheckMode = 'PRACTICE' | 'GRADED';

export interface PracticedAtom {
  atomType: string;
  atomId: string;
}

export interface CreateAttemptProps {
  userId: string;
  exerciseId: string;
  assignmentId?: string | null;
  enrollmentId?: string | null;
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  checkMode: CheckMode;
  practicedAtoms: PracticedAtom[];
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
  checkMode: CheckMode;
  practicedAtoms: PracticedAtom[];
  status: AttemptStatus;
  score: number | null;
  passed: boolean | null;
  timeSpentSeconds: number;
  submittedAnswer: unknown;
  validationDetails: unknown;
  feedback: unknown;
  answerHash: string | null;
  revisionCount: number;
  answersRevealed: boolean;
  selfChecksUsed: number;
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
    private _checkMode: CheckMode,
    private _practicedAtoms: PracticedAtom[],
    private _status: AttemptStatus,
    private _score: number | null,
    private _passed: boolean | null,
    private _timeSpentSeconds: number,
    private _submittedAnswer: unknown,
    private _validationDetails: unknown,
    private _feedback: unknown,
    private _answerHash: string | null,
    private _revisionCount: number,
    private _answersRevealed: boolean,
    private _selfChecksUsed: number,
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
      props.checkMode,
      props.practicedAtoms,
      'IN_PROGRESS',
      null,
      null,
      0,
      null,
      null,
      null,
      null,
      0,
      false,
      0,
      new Date(),
      null,
      null,
    );

    attempt.addDomainEvent(
      new AttemptStartedEvent(attempt.id, {
        attemptId: attempt.id,
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
      props.checkMode,
      props.practicedAtoms,
      props.status,
      props.score,
      props.passed,
      props.timeSpentSeconds,
      props.submittedAnswer,
      props.validationDetails,
      props.feedback,
      props.answerHash,
      props.revisionCount,
      props.answersRevealed,
      props.selfChecksUsed,
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

  /**
   * Another go at the same attempt, after a check the learner was not happy with.
   *
   * `word_bank_gap_fill` is checked against the server rather than in the browser, and
   * its behaviour spec makes checks unlimited: correct gaps lock, wrong ones stay
   * editable, and nothing gates a further check. Without this the first check would
   * score the attempt and every later one would be refused as an invalid transition.
   *
   * Practice only, and never after a reveal: once the answers have been handed over,
   * checking again measures nothing. A graded attempt is a submission to a teacher and
   * stays a single shot.
   */
  reopenForRecheck(): Result<void, InvalidAttemptTransitionError> {
    if (this._checkMode !== 'PRACTICE') {
      return Result.fail(
        new InvalidAttemptTransitionError('Only a practice attempt can be checked again'),
      );
    }
    if (this._answersRevealed) {
      return Result.fail(
        new InvalidAttemptTransitionError('Cannot check again once the answers were revealed'),
      );
    }
    if (this._status !== 'SCORED') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot check an attempt with status ${this._status} again`,
        ),
      );
    }

    this._revisionCount += 1;
    this._status = 'IN_PROGRESS';

    return Result.ok();
  }

  score(
    rawScore: number,
    passed: boolean,
    validationDetails: unknown,
    feedback: unknown,
    /** How the answer was produced; omitted by templates that cannot say. */
    answerForm?: AnswerForm,
    /** Verdict per gap, in gap order; omitted by templates not graded gap by gap. */
    gapResults?: Array<{ gapKey: string; correct: boolean }>,
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

    // Only the first check is evidence. A re-check is the learner correcting
    // themselves with the wrong gaps still on screen, and counting it would tell
    // progress and the SRS that the word was known when it had just been shown to
    // be the one they got wrong.
    if (this._revisionCount === 0) {
      this.addDomainEvent(
        new AttemptScoredEvent(this.id, {
          userId: this._userId,
          exerciseId: this._exerciseId,
          score: this._score,
          timeSpentSeconds: this._timeSpentSeconds,
          completed: true,
          practicedAtoms: this._practicedAtoms,
          templateCode: this._templateCode,
          passed,
          ...(answerForm === undefined ? {} : { answerForm }),
          ...(gapResults === undefined ? {} : { gapResults }),
        }),
      );
    }

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

  /**
   * The learner asked to be shown the answers rather than work them out.
   *
   * Only after an answer has been submitted: revealing from IN_PROGRESS would turn
   * the exercise into a reading task, and the whole reason the reveal is a separate
   * action is that being wrong must not hand the word over by itself.
   *
   * Idempotent — asking twice shows the same answers and changes nothing.
   */
  revealAnswers(): Result<void, InvalidAttemptTransitionError> {
    if (this._status === 'IN_PROGRESS' || this._status === 'ABANDONED') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot reveal answers for an attempt with status ${this._status}`,
        ),
      );
    }

    this._answersRevealed = true;
    return Result.ok();
  }

  /**
   * Spend one self-check.
   *
   * The budget is the exercise's, so it is passed in rather than stored: the same
   * attempt would have a different allowance if the author changed the setting, and the
   * setting is the one the learner is working under right now.
   *
   * Only while the work is still open. After submission the answer is with the teacher,
   * and a check then would be a second grading — by the machine, on an answer the
   * template says only a human may reject.
   */
  useSelfCheck(budget: number): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'IN_PROGRESS') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot self-check an attempt with status ${this._status}`,
        ),
      );
    }
    if (this._selfChecksUsed >= budget) {
      return Result.fail(
        new InvalidAttemptTransitionError(
          budget === 0
            ? 'This exercise offers no self-checks'
            : `All ${budget} self-checks have been used`,
        ),
      );
    }

    this._selfChecksUsed += 1;
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
  get checkMode(): CheckMode { return this._checkMode; }
  get practicedAtoms(): PracticedAtom[] { return this._practicedAtoms; }
  get status(): AttemptStatus { return this._status; }
  get scoreValue(): number | null { return this._score; }
  get passed(): boolean | null { return this._passed; }
  get timeSpentSeconds(): number { return this._timeSpentSeconds; }
  get submittedAnswer(): unknown { return this._submittedAnswer; }
  get validationDetails(): unknown { return this._validationDetails; }
  get feedback(): unknown { return this._feedback; }
  get answerHash(): string | null { return this._answerHash; }
  get revisionCount(): number { return this._revisionCount; }
  get answersRevealed(): boolean { return this._answersRevealed; }
  get selfChecksUsed(): number { return this._selfChecksUsed; }
  get startedAt(): Date { return this._startedAt; }
  get submittedAt(): Date | null { return this._submittedAt; }
  get scoredAt(): Date | null { return this._scoredAt; }
}
