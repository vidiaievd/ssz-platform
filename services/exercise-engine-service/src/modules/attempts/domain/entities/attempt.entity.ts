import { randomUUID } from 'node:crypto';
import { AggregateRoot } from '../../../../shared/domain/aggregate-root.base.js';
import { Result } from '../../../../shared/kernel/result.js';
import { Score } from '../value-objects/score.vo.js';
import {
  AttemptAlreadySubmittedError,
  InvalidAttemptTransitionError,
  InvalidScoreError,
  ReviewCommentRequiredError,
} from '../exceptions/attempt.errors.js';
import { AttemptStartedEvent } from '../events/attempt-started.event.js';
import type { AnswerForm } from '@ssz/contracts';
import type { RubricMarks, RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import { AttemptScoredEvent } from '../events/attempt-scored.event.js';
import { AttemptCompletedUnscoredEvent } from '../events/attempt-completed-unscored.event.js';
import { AttemptRoutedForReviewEvent } from '../events/attempt-routed-for-review.event.js';
import { AttemptReviewedEvent } from '../events/attempt-reviewed.event.js';

export type AttemptStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'SCORED'
  | 'ROUTED_FOR_REVIEW'
  /** A teacher read the submission and sent it back instead of scoring it. */
  | 'RETURNED'
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
  recheckCount: number;
  answersRevealed: boolean;
  selfChecksUsed: number;
  startedAt: Date;
  submittedAt: Date | null;
  scoredAt: Date | null;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  reviewDecisions: ReviewDecision[] | null;
  schoolId: string | null;
  containerId: string | null;
  groupId: string | null;
  exercisePath: ExercisePathSnapshot | null;
  reviewClaimedBy: string | null;
  reviewClaimedAt: Date | null;
  previousAttemptId: string | null;
  autoPassedItems: number | null;
  totalItems: number | null;
  draftAnswer: unknown;
  draftSavedAt: Date | null;
  rubricMarks: RubricMarks | null;
  rubricSnapshot: RubricSnapshot | null;
}

/**
 * What a teacher decided about one item of a submission.
 *
 * The templates that reach review are sets — sentences to translate, sentences to
 * correct — and "which one was not accepted" is the feedback. A single verdict for the
 * whole set would hide exactly what the learner needs.
 */
export interface ReviewDecision {
  itemId: string;
  approved: boolean;
  comment?: string;
}

/**
 * Course · module · exercise titles snapshotted at attempt start (plan 44 §0.3).
 * Survives the exercise being renamed or removed later — the review screen
 * shows this even when `exercise` no longer resolves.
 */
export interface ExercisePathSnapshot {
  course: string;
  module: string | null;
  exercise: string | null;
}

/**
 * How long "someone is looking at this" holds (plan 44 §44.8).
 *
 * Expiry is a reading of `reviewClaimedAt`, not a job that clears the column: a marker
 * left behind by a teacher who closed their laptop must stop blocking the view by
 * itself, and a background sweep would be one more thing to be down.
 */
export const REVIEW_CLAIM_TTL_MS = 15 * 60 * 1000;

/** How an attempt ended, when it ended by a person's decision. */
export interface DeliveredVerdict {
  outcome: 'approved' | 'returned';
  at: Date;
  reviewerId: string;
  comment: string | null;
}

/** Someone is looking at this submission, until `expiresAt` says otherwise. */
export interface ReviewLock {
  teacherId: string;
  expiresAt: Date;
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
    private _reviewedByUserId: string | null = null,
    private _reviewedAt: Date | null = null,
    private _reviewComment: string | null = null,
    private _reviewDecisions: ReviewDecision[] | null = null,
    private _schoolId: string | null = null,
    private _containerId: string | null = null,
    private _groupId: string | null = null,
    private _exercisePath: ExercisePathSnapshot | null = null,
    private _reviewClaimedBy: string | null = null,
    private _reviewClaimedAt: Date | null = null,
    private _previousAttemptId: string | null = null,
    private _autoPassedItems: number | null = null,
    private _totalItems: number | null = null,
    private _recheckCount: number = 0,
    private _draftAnswer: unknown = null,
    private _draftSavedAt: Date | null = null,
    private _rubricMarks: RubricMarks | null = null,
    private _rubricSnapshot: RubricSnapshot | null = null,
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
      props.reviewedByUserId,
      props.reviewedAt,
      props.reviewComment,
      props.reviewDecisions,
      props.schoolId,
      props.containerId,
      props.groupId,
      props.exercisePath,
      props.reviewClaimedBy,
      props.reviewClaimedAt,
      props.previousAttemptId,
      props.autoPassedItems,
      props.totalItems,
      props.recheckCount,
      props.draftAnswer,
      props.draftSavedAt,
      props.rubricMarks,
      props.rubricSnapshot,
    );
  }

  /**
   * Keep the unfinished work.
   *
   * Only while the attempt is open: a draft written after the answer is in would be a
   * second answer nobody reads, and one arriving after a teacher's verdict would look
   * like an edit to work that has already been marked.
   *
   * The draft is stored as it arrives and never validated. A shape the runner cannot
   * read back is a bug in the runner; a save refused because the half-written text does
   * not parse is the failure this column exists to prevent.
   */
  saveDraft(answer: unknown): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'IN_PROGRESS') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot save a draft for attempt with status ${this._status}`,
        ),
      );
    }

    this._draftAnswer = answer;
    this._draftSavedAt = new Date();
    return Result.ok();
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

    this._recheckCount += 1;
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
    if (this._recheckCount === 0) {
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

  /**
   * Hands the submission to a person.
   *
   * `counts` is the validator's own tally at this moment — how much it closed by
   * itself out of how many items. It is written down so the queue can be a list
   * rather than a run of the validator over every row on the page; it is a hint and
   * never the truth, and a verdict recomputes the parse before acting on it
   * (plan 44 §0.3).
   */
  routeForReview(
    counts?: {
      autoPassedItems: number | null;
      totalItems: number | null;
    },
    /**
     * The rubric this submission will be graded against, for the templates that are
     * graded that way (`writing_task`, plan 50 §3.2).
     *
     * Taken here rather than read at verdict time on purpose: the marks a teacher sets
     * belong to the criteria they saw, and an author who reworded or reweighted the
     * rubric in between must not be able to restate a verdict already delivered
     * (IMPLEMENTATION.md, "Persistence").
     */
    rubricSnapshot?: RubricSnapshot | null,
  ): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'SUBMITTED') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot route attempt with status ${this._status} for review`,
        ),
      );
    }

    this._status = 'ROUTED_FOR_REVIEW';
    if (counts) {
      this._autoPassedItems = counts.autoPassedItems;
      this._totalItems = counts.totalItems;
    }
    if (rubricSnapshot) {
      this._rubricSnapshot = rubricSnapshot;
    }

    this.addDomainEvent(
      new AttemptCompletedUnscoredEvent(this.id, {
        userId: this._userId,
        exerciseId: this._exerciseId,
        score: null,
        timeSpentSeconds: this._timeSpentSeconds,
        completed: false,
      }),
    );

    this.addDomainEvent(
      new AttemptRoutedForReviewEvent(this.id, {
        attemptId: this.id,
        userId: this._userId,
        exerciseId: this._exerciseId,
        templateCode: this._templateCode,
        schoolId: this._schoolId,
        containerId: this._containerId,
        groupId: this._groupId,
        submittedAt: (this._submittedAt ?? new Date()).toISOString(),
      }),
    );

    return Result.ok();
  }

  /**
   * Fills in review context the attempt started without — a neighbour service that
   * was silent at start, or a row that predates the migration. Only ever fills
   * blanks: a value snapshotted at start describes where the learner was then, and
   * a group they moved to since does not get to rewrite it.
   */
  backfillReviewContext(props: {
    schoolId?: string | null;
    containerId?: string | null;
    groupId?: string | null;
    exercisePath?: ExercisePathSnapshot | null;
  }): void {
    this._schoolId ??= props.schoolId ?? null;
    this._containerId ??= props.containerId ?? null;
    this._groupId ??= props.groupId ?? null;
    this._exercisePath ??= props.exercisePath ?? null;
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

  /**
   * A teacher's verdict on a submission that the machine could not close.
   *
   * Two outcomes and no third: approved, which scores the attempt and ends it, or
   * returned, which ends this attempt with a comment and leaves the learner free to try
   * again. There is no "partly graded" state to sit in, because a submission waiting on a
   * teacher who has already read it is the one thing a review queue must never contain.
   *
   * The score is computed by the caller from the decisions — the domain does not know how
   * many items the exercise had, only what was decided about them.
   */
  review(props: {
    reviewerId: string;
    outcome: 'approved' | 'returned';
    decisions: ReviewDecision[];
    comment: string | null;
    /** 0–100. Required when approving, ignored when returning. */
    score?: number;
    passed?: boolean;
    /** How much of the submission counted, for the letter back to the learner. */
    approvedItems?: number;
    totalItems?: number;
  }): Result<
    void,
    InvalidScoreError | InvalidAttemptTransitionError | ReviewCommentRequiredError
  > {
    if (this._status !== 'ROUTED_FOR_REVIEW') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot review an attempt with status ${this._status}`,
        ),
      );
    }

    // A return is an instruction to try again, and one without a word on it is not an
    // instruction. Checked here rather than at the edge so that no caller — the queue,
    // a batch, a future one — can send work back silently.
    if (props.outcome === 'returned' && (props.comment ?? '').trim() === '') {
      return Result.fail(new ReviewCommentRequiredError());
    }

    this._reviewedByUserId = props.reviewerId;
    this._reviewedAt = new Date();
    this._reviewComment = props.comment;
    this._reviewDecisions = props.decisions;
    // Nobody is looking at this any more — it has been decided (plan 44 §44.8).
    this._reviewClaimedBy = null;
    this._reviewClaimedAt = null;

    if (props.outcome === 'returned') {
      this._status = 'RETURNED';
      this.addReviewedEvent(props, null);
      return Result.ok();
    }

    const scoreResult = Score.create(props.score ?? 0);
    if (scoreResult.isFail) return Result.fail(scoreResult.error);

    this._score = scoreResult.value.value;
    this._passed = props.passed ?? scoreResult.value.value > 0;
    this._scoredAt = new Date();
    this._status = 'SCORED';

    // The same event a machine-scored attempt raises, because the attempt is now scored:
    // progress and the SRS have been waiting on this verdict since it was routed, and a
    // teacher's judgement of a translation is the strongest evidence this template has.
    this.addDomainEvent(
      new AttemptScoredEvent(this.id, {
        userId: this._userId,
        exerciseId: this._exerciseId,
        score: this._score,
        timeSpentSeconds: this._timeSpentSeconds,
        completed: true,
        practicedAtoms: this._practicedAtoms,
        templateCode: this._templateCode,
        passed: this._passed,
      }),
    );

    this.addReviewedEvent(props, this._score);

    return Result.ok();
  }

  /**
   * The letter back to the learner, raised on both outcomes.
   *
   * Including an approval a teacher wrote nothing on: from where the learner sits, an
   * unanswered submission and one answered without comment look identical, and the
   * silence is exactly what the queue was built to end.
   */
  private addReviewedEvent(
    props: {
      reviewerId: string;
      outcome: 'approved' | 'returned';
      comment: string | null;
      approvedItems?: number;
      totalItems?: number;
    },
    score: number | null,
  ): void {
    // Anywhere a person wrote something: the overall word, or a note on one sentence. An
    // approval with nothing said in general but a remark on sentence two still has
    // something the learner must be sent to read (plan 44 §44.9).
    const hasComment =
      (props.comment ?? '').trim() !== '' ||
      (this._reviewDecisions ?? []).some((decision) => (decision.comment ?? '').trim() !== '');

    this.addDomainEvent(
      new AttemptReviewedEvent(this.id, {
        attemptId: this.id,
        userId: this._userId,
        exerciseId: this._exerciseId,
        templateCode: this._templateCode,
        reviewerId: props.reviewerId,
        schoolId: this._schoolId,
        // Where the work lives and what it is called, as it read when the learner started.
        // The message that reaches them names the exercise instead of pointing vaguely at
        // one, and links to the course it belongs to (plan 47.4).
        containerId: this._containerId,
        exercisePath: this._exercisePath,
        outcome: props.outcome,
        score,
        comment: props.comment,
        hasComment,
        approvedItems: props.approvedItems ?? 0,
        totalItems: props.totalItems ?? 0,
        occurredAt: new Date().toISOString(),
      }),
    );
  }

  /**
   * Attaches the review-queue context resolved best-effort at attempt start
   * (plan 44 §44.4): where the exercise sits, and — when it followed a
   * RETURNED verdict — which attempt it resubmits and what number try this is.
   *
   * Every field is independently nullable because each comes from a
   * different neighbor service that may not have answered; starting the
   * attempt matters more than knowing all of this up front (plan 44 §44.4).
   */
  snapshotReviewContext(props: {
    schoolId: string | null;
    containerId: string | null;
    groupId: string | null;
    exercisePath: ExercisePathSnapshot | null;
    previousAttemptId: string | null;
    revisionCount: number;
  }): void {
    this._schoolId = props.schoolId;
    this._containerId = props.containerId;
    this._groupId = props.groupId;
    this._exercisePath = props.exercisePath;
    this._previousAttemptId = props.previousAttemptId;
    this._revisionCount = props.revisionCount;
  }

  /**
   * Who, if anyone, is looking at this submission right now (plan 44 §44.8).
   *
   * Expiry is read here rather than swept in the background, so the marker of a teacher
   * who closed their laptop stops holding the submission by itself. It lives on the
   * entity because the TTL does: the queue, the single submission and the claim command
   * must all agree on when a marker has lapsed, and three copies of `+ 15 minutes` is
   * exactly how they would stop agreeing.
   */
  activeReviewLock(now: Date = new Date()): ReviewLock | null {
    if (this._reviewClaimedBy === null || this._reviewClaimedAt === null) return null;

    const expiresAt = new Date(this._reviewClaimedAt.getTime() + REVIEW_CLAIM_TTL_MS);
    if (expiresAt <= now) return null;

    return { teacherId: this._reviewClaimedBy, expiresAt };
  }

  /**
   * The verdict this attempt already carries, if a person delivered one.
   *
   * `SCORED` alone does not qualify: the machine scores too, and a colleague's name is
   * exactly what the conflict banner has to show (plan 44 §44.9, criterion 24). Only a
   * signature makes it somebody's decision.
   */
  deliveredVerdict(): DeliveredVerdict | null {
    if (this._reviewedByUserId === null) return null;

    if (this._status === 'RETURNED') {
      return {
        outcome: 'returned',
        at: this._reviewedAt ?? this._submittedAt ?? this._startedAt,
        reviewerId: this._reviewedByUserId,
        comment: this._reviewComment,
      };
    }

    if (this._status === 'SCORED') {
      return {
        outcome: 'approved',
        at: this._reviewedAt ?? this._scoredAt ?? this._startedAt,
        reviewerId: this._reviewedByUserId,
        comment: this._reviewComment,
      };
    }

    return null;
  }

  /**
   * A reviewer says they are looking at this one (plan 44 §44.8).
   *
   * The marker is advisory and never a mutex: a colleague's live claim is not displaced,
   * and the answer is then *their* claim rather than an error — the caller may still read
   * the submission and still deliver a verdict, it just now knows to say who else is in
   * here. Claiming again as the same reviewer extends, which is what a screen left open
   * for twenty minutes needs.
   *
   * A submission nobody is waiting on cannot be claimed. The marker is cleared by a
   * verdict, so one placed after the verdict has nothing left to clear it and would tell
   * colleagues for fifteen minutes that work is under way on something already finished.
   */
  claimForReview(
    teacherId: string,
    now: Date = new Date(),
  ): Result<ReviewLock, InvalidAttemptTransitionError> {
    if (this._status !== 'ROUTED_FOR_REVIEW') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot claim an attempt with status ${this._status} for review`,
        ),
      );
    }

    const held = this.activeReviewLock(now);
    if (held !== null && held.teacherId !== teacherId) {
      return Result.ok(held);
    }

    this._reviewClaimedBy = teacherId;
    this._reviewClaimedAt = now;
    return Result.ok({ teacherId, expiresAt: new Date(now.getTime() + REVIEW_CLAIM_TTL_MS) });
  }

  /**
   * The reviewer left the screen. Returns whatever marker still stands.
   *
   * Idempotent, and never takes a colleague's: a teacher closing their tab must not
   * release the submission a second teacher has just picked up. A lapsed marker is swept
   * here because we are already writing the row — expiry is decided on reading, so the
   * column is untidy rather than wrong either way.
   */
  releaseReview(teacherId: string, now: Date = new Date()): ReviewLock | null {
    const held = this.activeReviewLock(now);
    if (held !== null && held.teacherId !== teacherId) {
      return held;
    }

    this._reviewClaimedBy = null;
    this._reviewClaimedAt = null;
    return null;
  }

  /** The work in progress, as last autosaved. `null` when the runner never saved one. */
  get draftAnswer(): unknown { return this._draftAnswer ?? null; }
  get draftSavedAt(): Date | null { return this._draftSavedAt; }
  get rubricMarks(): RubricMarks | null { return this._rubricMarks; }
  get rubricSnapshot(): RubricSnapshot | null { return this._rubricSnapshot; }

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
  get recheckCount(): number { return this._recheckCount; }
  get answersRevealed(): boolean { return this._answersRevealed; }
  get selfChecksUsed(): number { return this._selfChecksUsed; }
  get startedAt(): Date { return this._startedAt; }
  get submittedAt(): Date | null { return this._submittedAt; }
  get scoredAt(): Date | null { return this._scoredAt; }
  get reviewedByUserId(): string | null { return this._reviewedByUserId; }
  get reviewedAt(): Date | null { return this._reviewedAt; }
  get reviewComment(): string | null { return this._reviewComment; }
  get reviewDecisions(): ReviewDecision[] | null { return this._reviewDecisions; }
  get schoolId(): string | null { return this._schoolId; }
  get containerId(): string | null { return this._containerId; }
  get groupId(): string | null { return this._groupId; }
  get exercisePath(): ExercisePathSnapshot | null { return this._exercisePath; }
  get reviewClaimedBy(): string | null { return this._reviewClaimedBy; }
  get reviewClaimedAt(): Date | null { return this._reviewClaimedAt; }
  get previousAttemptId(): string | null { return this._previousAttemptId; }
  get autoPassedItems(): number | null { return this._autoPassedItems; }
  get totalItems(): number | null { return this._totalItems; }
}
