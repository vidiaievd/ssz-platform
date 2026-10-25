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
import type {
  AnswerForm,
  AttemptReviewedAiDraft,
  AttemptTarget,
  Focus,
  Modality,
  Skill,
} from '@ssz/contracts';
import type { RubricMarks, RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import type { AttemptTiming } from '../events/attempt-timing.js';
import { AttemptScoredEvent } from '../events/attempt-scored.event.js';
import { AttemptCompletedUnscoredEvent } from '../events/attempt-completed-unscored.event.js';
import { AttemptRoutedForReviewEvent } from '../events/attempt-routed-for-review.event.js';
import { AttemptReviewedEvent } from '../events/attempt-reviewed.event.js';
import { AttemptReturnedEvent } from '../events/attempt-returned.event.js';

export type AttemptStatus =
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'SCORED'
  | 'ROUTED_FOR_REVIEW'
  /** A teacher read the submission and sent it back instead of scoring it. */
  | 'RETURNED'
  | 'ABANDONED'
  /**
   * Free-form work nobody will read (plan 79, step 2.1c): no school's queue, and no model
   * the learner may ask. Final — the honest answer instead of a wait with no end.
   */
  | 'NO_REVIEWER';

export type DifficultyLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

// PRACTICE: expectedAnswers shipped to the client for instant local checking.
// GRADED: expectedAnswers withheld; the correct answer is never revealed in feedback either.
export type CheckMode = 'PRACTICE' | 'GRADED';

/**
 * One question of a `short_answer` set, handed in on its own and graded on the spot.
 *
 * The verdict is stored rather than recomputed on read for one reason: the author may
 * edit the key afterwards, and what the student was told at the time is a fact about
 * what happened. The queue recomputes deliberately (plan 51 §6.7) and may disagree —
 * that disagreement is information, and erasing it by regrading this list would hide it.
 */
export interface AnsweredQuestion {
  questionId: string;
  text: string;
  verdict: 'pass' | 'partial' | 'fail';
  answeredAt: Date;
}

/**
 * One sentence of a `sentence_schema` set, as the attempt last saw it.
 *
 * Unlike an answered question, a checked sentence is **not** final: the handoff gives the
 * student `Rett opp` and unlimited retries, so this is the row's running state rather than
 * a record of a decision — how many checks it has taken, where the pieces stand, and
 * whether it is closed.
 *
 * A row closes two ways, and the difference is the whole reason this is stored rather than
 * recomputed from the submission: solved, or revealed. `Vis riktig skjema` fills the
 * answer in, so a revealed row is worth nothing however the board looks afterwards — and
 * a client that could simply omit the flag on submit would have found the cheapest route
 * to a full score.
 */
export interface CheckedRow {
  rowId: string;
  /** How many times `Sjekk` has been pressed on this sentence. 1-based, as the runner shows it. */
  attempts: number;
  /** `fieldId → item ids, in the order they were stacked` — the board as last checked. */
  placement: Record<string, string[]>;
  solved: boolean;
  revealed: boolean;
  checkedAt: Date;
}

/**
 * One question of a `multiple_choice` set, as the attempt last saw it.
 *
 * Between the two lists above in kind, and the difference is the attempt budget. An
 * answered question is final on the first try; a checked sentence may be retried without
 * limit; a picked question has `settings.retry` tries and then closes — right, revealed
 * with «Vis svaret», or out of budget.
 *
 * Every field here is answer-bearing, which is why it is stored rather than sent up with
 * the submission. `picks` is in order and `picks[0]` is the only one that scores, so the
 * try a question was taken on *is* the score. `eliminated` has to accumulate across picks
 * or the 50/50 deals itself again on every wrong answer. And `revealed` costs the
 * question its marks however the last pick looked — a client that could leave the flag
 * off would have found the cheapest route to a full score.
 */
export interface PickedOption {
  questionId: string;
  /** The option picked on each attempt, in order. `picks[0]` is the first try. */
  picks: string[];
  /** The options a 50/50 has dimmed so far. Cumulative, never re-dealt. */
  eliminated: string[];
  correct: boolean;
  /** No further pick is possible: right, revealed, or the budget is spent. */
  closed: boolean;
  /** The student asked to be shown the answer instead of trying again. */
  revealed: boolean;
  pickedAt: Date;
}

export interface PracticedAtom {
  atomType: string;
  atomId: string;
}

/**
 * Where a piece of work was done (plan 57 §7).
 *
 * Decided when the attempt starts and never re-derived: the same exercise is classwork
 * on Tuesday and homework on Thursday, and only the moment it was opened knows which.
 */
export type WorkContext = 'classwork' | 'homework' | 'self_study';

/** What an exercise trains, as Content Service resolved it at attempt start (plan 55 §3.6). */
export interface AttemptAxes {
  skills: Skill[];
  focus: Focus[];
  /** How the answer had to be produced (plan 63 §2 E). `unknown` where nothing judged it. */
  modality?: Modality;
}

/**
 * One address snapshotted at attempt start — plan 63 §2 D.
 *
 * `itemKey` is the template's own name for the piece (`sentenceId#tokenIndex` for a gap,
 * the pair id for a pair); `null` addresses the exercise as a whole, which is all a
 * template that grades as one can offer. The role says how much the evidence weighs:
 * `focus` is what the item examined, `context` is what the learner had to know to get
 * there and was not examined on.
 */
export interface AttemptItemTarget {
  itemKey: string | null;
  atomType: string;
  atomId: string;
  role: 'focus' | 'context';
}

export interface CreateAttemptProps {
  userId: string;
  exerciseId: string;
  assignmentId?: string | null;
  enrollmentId?: string | null;
  /** Scheduled lesson this attempt is being done in, when the caller knows of one. */
  lessonId?: string | null;
  templateCode: string;
  targetLanguage: string;
  difficultyLevel: DifficultyLevel;
  checkMode: CheckMode;
  practicedAtoms: PracticedAtom[];
  axes: AttemptAxes;
  /** What each piece of the exercise is about, as Content Service resolved it. */
  itemTargets?: AttemptItemTarget[];
  /**
   * The task was a disposable probe rather than a catalogue exercise (plan 63 phase 9).
   *
   * Snapshotted rather than looked up, and this one has a sharper reason than the rest of
   * the snapshot: the probe is *designed to disappear*. By the time a teacher marks this
   * work or a consumer reads the event it produced, the row it was resolved from is very
   * likely gone — so the only place the fact can live is here, on the attempt, which
   * outlives it.
   */
  ephemeral?: boolean;
  /**
   * When the attempt began, if not now: a start replayed from a phone's offline journal is
   * dated by the phone (VoxOrd offline plan, B4), already bounded by `resolveClientTime`.
   */
  startedAt?: Date;
  /** The start was replayed from a phone's offline journal — see `recordedOffline`. */
  recordedOffline?: boolean;
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
  skills: Skill[];
  focus: Focus[];
  itemTargets?: AttemptItemTarget[];
  modality?: Modality;
  ephemeral?: boolean;
  workContext: WorkContext | null;
  lessonId: string | null;
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
  answeredQuestions: AnsweredQuestion[] | null;
  checkedRows: CheckedRow[] | null;
  pickedOptions: PickedOption[] | null;
  /** `minimal_pairs`: the probes this sitting drew at its start (plan 72 §3.6). */
  probeDraw?: unknown;
  recordedOffline?: boolean;
  rubricMarks: RubricMarks | null;
  rubricSnapshot: RubricSnapshot | null;
  reviewAiPolicy?: AttemptReviewAiPolicy | null;
  provisionalAiVerdict?: ProvisionalAiVerdict | null;
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

/** A verdict on a submission in review — a teacher's (`review`) or a model's (`reviewByAi`). */
export interface ReviewVerdict {
  outcome: 'approved' | 'returned';
  decisions: ReviewDecision[];
  comment: string | null;
  /** 0–100. Required when approving, ignored when returning. */
  score?: number;
  passed?: boolean;
  /** How much of the submission counted, for the letter back to the learner. */
  approvedItems?: number;
  totalItems?: number;
  /**
   * The marks a teacher set, for the submissions graded out of a rubric.
   *
   * Kept on both outcomes: work sent back was still read criterion by criterion, and
   * the learner's next draft is answering those marks.
   */
  rubricMarks?: RubricMarks | null;
  /**
   * The verdict per item, for the templates a person rules on item by item rather than
   * as one — a `read_aloud` prompt passes on its own marks (plan 70, Q1-A). Carried on
   * both outcomes, with the addresses of each item, so that the memory hears about each
   * prompt and not only about the attempt.
   */
  gapResults?: Array<{ gapKey: string; correct: boolean }>;
  /** The delivery handed part of the answer over — see `AttemptScoredPayload`. */
  evidenceLowered?: boolean;
  /**
   * What the reviewer did with a model's draft (plan 79, 1.5), for the letter's
   * `aiDraft`. Absent when they were shown none.
   */
  aiDraft?: AttemptReviewedAiDraft | null;
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

/** A school's mode that has a model answer first (plan 80, R1). */
export type ReviewAiMode = 'ai_then_teacher' | 'ai_with_sampling';

/**
 * The school's review policy as it stood when this work was handed in (plan 80, step 3a).
 *
 * Taken at hand-in for the same reason as the rubric: a school that changes its mode or its
 * term afterwards must not rewrite the terms of work already waiting. Present only where a
 * model may answer first — the school chose a mode with one, its plan has the key, and the
 * template can be read by one. Everything else is reviewed by a teacher, as before.
 */
export interface AttemptReviewAiPolicy {
  mode: ReviewAiMode;
  /**
   * When the model's verdict counts by itself if no teacher has given theirs (R2): hand-in
   * plus the term. Null when there was no term to read — the work then waits for a teacher.
   */
  autoAcceptAt: Date | null;
  /**
   * `ai_with_sampling` only: the work goes to a teacher whatever the model says — its
   * template is on the course's list, or it fell into the school's random share (§3).
   * Always false in `ai_then_teacher`, where every piece of work goes to one.
   */
  teacherDrawn: boolean;
}

/**
 * A model's verdict on a school's work that does not count yet (plan 80 §3): the learner
 * reads it at once, the work stays in the teacher's queue, and nothing reaches progress or
 * memory. It becomes the one that counts only if no teacher gives theirs by the term
 * (`autoAcceptAt`, step 4) — kept whole for that, as the model ruled it.
 */
export interface ProvisionalAiVerdict extends Omit<ReviewVerdict, 'aiDraft'> {
  at: Date;
}

/** A provisional verdict as the learner reads it — see `Attempt.pendingAiVerdict`. */
export interface PendingAiVerdict {
  outcome: 'approved' | 'returned';
  /** The model's summary, written to the learner. */
  comment: string | null;
  at: Date;
  /** When it counts by itself if no teacher answers; null — it waits for the teacher. */
  countsAt: Date | null;
}

/** Where a model's verdict landed: closing the attempt, or waiting for a teacher beside it. */
export type AiVerdictLanding = 'final' | 'provisional';

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
    private _answeredQuestions: AnsweredQuestion[] = [],
    private _checkedRows: CheckedRow[] = [],
    private _pickedOptions: PickedOption[] = [],
    // Appended at the tail like every field added after the fact — the constructor is
    // positional, and the alternative is renumbering every call site (plan 55 §3.6).
    private _skills: Skill[] = [],
    private _focus: Focus[] = [],
    private _workContext: WorkContext | null = null,
    private _lessonId: string | null = null,
    private _itemTargets: AttemptItemTarget[] = [],
    private _modality: Modality = 'unknown',
    private _ephemeral: boolean = false,
    private _probeDraw: unknown = null,
    private _recordedOffline: boolean = false,
    private _reviewAiPolicy: AttemptReviewAiPolicy | null = null,
    private _provisionalAiVerdict: ProvisionalAiVerdict | null = null,
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
      props.startedAt ?? new Date(),
      null,
      null,
    );

    attempt._skills = props.axes.skills;
    attempt._focus = props.axes.focus;
    attempt._modality = props.axes.modality ?? 'unknown';
    attempt._itemTargets = props.itemTargets ?? [];
    attempt._ephemeral = props.ephemeral ?? false;
    attempt._recordedOffline = props.recordedOffline ?? false;
    attempt._lessonId = props.lessonId ?? null;
    // Derived once, here: a lesson names classwork, an assignment names homework, and
    // everything else is the learner's own time.
    attempt._workContext = props.lessonId
      ? 'classwork'
      : props.assignmentId
        ? 'homework'
        : 'self_study';

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
      props.answeredQuestions ?? [],
      props.checkedRows ?? [],
      props.pickedOptions ?? [],
      props.skills ?? [],
      props.focus ?? [],
      props.workContext ?? null,
      props.lessonId ?? null,
      props.itemTargets ?? [],
      props.modality ?? 'unknown',
      props.ephemeral ?? false,
      props.probeDraw ?? null,
      props.recordedOffline ?? false,
      props.reviewAiPolicy ?? null,
      props.provisionalAiVerdict ?? null,
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
  saveDraft(answer: unknown, now: Date = new Date()): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'IN_PROGRESS') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot save a draft for attempt with status ${this._status}`,
        ),
      );
    }

    this._draftAnswer = answer;
    this._draftSavedAt = now;
    return Result.ok();
  }

  submit(
    answer: unknown,
    answerHash: string,
    now: Date = new Date(),
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
    this._submittedAt = now;
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
   *
   * `maxChecks` is the budget, counted in checks of the whole thing including the first.
   * Omitted means unlimited, which is `word_bank_gap_fill`'s spec and was the only
   * behaviour this method had. `multiple_choice_group` brought a budget with it — its
   * `retry` setting is 1 / 2 / 99 checks (plan 54 §3.3) — and it has to be spent here
   * rather than in the runner, because a client that owned it would buy itself another
   * go for the price of one request.
   */
  reopenForRecheck(maxChecks?: number): Result<void, InvalidAttemptTransitionError> {
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

    // The check about to be reopened for is number `recheckCount + 2`: the first check
    // is number 1 and carries no recheck. So a budget of 2 allows exactly one reopen.
    if (maxChecks !== undefined && this._recheckCount + 2 > maxChecks) {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `No checks left on this attempt (${maxChecks} allowed)`,
        ),
      );
    }

    this._recheckCount += 1;
    this._status = 'IN_PROGRESS';

    return Result.ok();
  }

  /**
   * One part of the work checked, and the attempt kept open for the rest.
   *
   * `highlight_in_text` is answered one question per submit (plan 67, Q1-A). A submit that
   * leaves a question open is graded like any other — the validator's details, which carry
   * every question's state, are written down — and then the attempt goes back to being
   * worked on instead of being scored. So it is still the open attempt when the page is
   * reloaded, the way a `short_answer` set with two answers in is (plan 51 §8 Q6), and it is
   * scored exactly once, by the submit that closes the last question: that is the first
   * check `score()` sees, and the one it publishes for.
   */
  recordPartialCheck(validationDetails: unknown): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'SUBMITTED') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot record a partial check on attempt with status ${this._status}`,
        ),
      );
    }

    this._validationDetails = validationDetails;
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
    /** The delivery handed part of the answer over — see `AttemptScoredPayload`. */
    evidenceLowered?: boolean,
    /** When the verdict was reached — the server's time, or a replayed call's. */
    now: Date = new Date(),
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
    this._scoredAt = now;
    this._status = 'SCORED';

    // Only the first check is evidence. A re-check is the learner correcting
    // themselves with the wrong gaps still on screen, and counting it would tell
    // progress and the SRS that the word was known when it had just been shown to
    // be the one they got wrong.
    if (this._recheckCount === 0) {
      this.addDomainEvent(
        new AttemptScoredEvent(this.id, {
          ...this.timing(this._scoredAt),
          userId: this._userId,
          exerciseId: this._exerciseId,
          score: this._score,
          timeSpentSeconds: this._timeSpentSeconds,
          completed: true,
          practicedAtoms: this._practicedAtoms,
          skills: this._skills,
          focus: this._focus,
          containerId: this._containerId,
          workContext: this._workContext,
          ephemeral: this._ephemeral,
          groupId: this._groupId,
          lessonId: this._lessonId,
          templateCode: this._templateCode,
          passed,
          modality: this._modality,
          ...(answerForm === undefined ? {} : { answerForm }),
          // Each verdict carries the addresses of the gap it reports, so that a consumer
          // never has to join a key back to an address the author may have moved since.
          ...(gapResults === undefined ? {} : { gapResults: this.addressed(gapResults) }),
          ...(evidenceLowered === true ? { evidenceLowered: true } : {}),
          ...(this.wholeExerciseTargets().length === 0
            ? {}
            : { targets: this.wholeExerciseTargets() }),
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
    /**
     * The school lets a model answer this work first (plan 80). Only work a teacher
     * reviews carries one: without a school a model is the only reviewer anyway.
     */
    reviewAiPolicy?: AttemptReviewAiPolicy | null,
  ): Result<void, InvalidAttemptTransitionError> {
    if (reviewAiPolicy && this._schoolId === null) {
      return Result.fail(
        new InvalidAttemptTransitionError('Only work a school reviews takes its review policy'),
      );
    }
    const closed = this.closeUnscored('ROUTED_FOR_REVIEW', counts);
    if (closed.isFail) return closed;
    if (rubricSnapshot) {
      this._rubricSnapshot = rubricSnapshot;
    }
    if (reviewAiPolicy) {
      this._reviewAiPolicy = reviewAiPolicy;
    }

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
        reviewAiMode: this._reviewAiPolicy?.mode ?? null,
      }),
    );

    return Result.ok();
  }

  /**
   * Closes free-form work that nobody will read (plan 79, step 2.1c, decision Q5-A).
   *
   * The validator asked for a person, and there is none: the learner has no school, and
   * no model they may ask. Routing it anyway is what the platform did before this — a
   * row in a queue no screen shows, and «sent for review» forever. Here the work ends
   * where it is, honestly: handed in, unscored, and no `routed_for_review` raised, so
   * nothing downstream waits for a verdict that will never come.
   *
   * Counted as handed in, exactly like routed work (`completed_unscored`): the learner did
   * the exercise, and progress should not pretend they did not. Nothing reaches the memory —
   * nobody judged the answer, so there is no evidence of recall either way.
   */
  closeWithoutReviewer(counts?: {
    autoPassedItems: number | null;
    totalItems: number | null;
  }): Result<void, InvalidAttemptTransitionError> {
    return this.closeUnscored('NO_REVIEWER', counts);
  }

  /**
   * Work routed to a model that turned out unable to read it (plan 79, step 2.2a): the
   * learner's credits ran out between the hand-in and the call, the author switched the
   * checks off, the answer was blank, or every model failed. Left routed, it would wait
   * forever in a queue no screen shows — the hole 2.1c closed at hand-in.
   *
   * Nothing is announced: routing already counted the work as handed in, and nobody judged
   * it, so there is nothing for progress or memory to hear. Idempotent, so a redelivered
   * request answers from the row.
   */
  giveUpReview(): Result<void, InvalidAttemptTransitionError> {
    if (this._status === 'NO_REVIEWER') return Result.ok();
    if (this._status !== 'ROUTED_FOR_REVIEW') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot close attempt with status ${this._status} without a reviewer`,
        ),
      );
    }
    if (this._schoolId !== null) {
      return Result.fail(
        new InvalidAttemptTransitionError('A teacher reviews this submission'),
      );
    }
    this._status = 'NO_REVIEWER';
    return Result.ok();
  }

  /** Both ways free-form work leaves `SUBMITTED` without a score: to a reviewer, or to nobody. */
  private closeUnscored(
    status: 'ROUTED_FOR_REVIEW' | 'NO_REVIEWER',
    counts?: { autoPassedItems: number | null; totalItems: number | null },
  ): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'SUBMITTED') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          status === 'ROUTED_FOR_REVIEW'
            ? `Cannot route attempt with status ${this._status} for review`
            : `Cannot close attempt with status ${this._status} without a reviewer`,
        ),
      );
    }

    this._status = status;
    if (counts) {
      this._autoPassedItems = counts.autoPassedItems;
      this._totalItems = counts.totalItems;
    }

    this.addDomainEvent(
      new AttemptCompletedUnscoredEvent(this.id, {
        ...this.timing(this._submittedAt),
        userId: this._userId,
        exerciseId: this._exerciseId,
        score: null,
        timeSpentSeconds: this._timeSpentSeconds,
        completed: false,
        skills: this._skills,
        focus: this._focus,
        containerId: this._containerId,
        ephemeral: this._ephemeral,
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
    if (
      this._status === 'SCORED' ||
      this._status === 'ROUTED_FOR_REVIEW' ||
      this._status === 'NO_REVIEWER'
    ) {
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
   * Hand in one question of a set, for good.
   *
   * `short_answer` is answered a question at a time, each with its verdict returned
   * immediately and no way back (README's state machine: `writing → submitted`, final).
   * The attempt stays one attempt — everything built in plans 43-47 assumes "attempt =
   * unit of review" — so this appends rather than starting anything.
   *
   * The refusal of a second answer is the point of the method. IMPLEMENTATION.md states
   * it as a rule about the model, not the UI: "Disable resubmission in the model, not
   * just in the UI — the teacher queue assumes one answer per student per question." A
   * runner that hides the button is a runner one replayed request away from two answers
   * to the same question, and the queue has no way to tell which one the student meant.
   *
   * Only while the attempt is open: a question answered after the whole set went to a
   * teacher would be an edit to work already being marked.
   */
  answerQuestion(props: {
    questionId: string;
    text: string;
    verdict: 'pass' | 'partial' | 'fail';
    /** When it was answered, if not now — a call replayed from the offline journal. */
    at?: Date;
  }): Result<void, InvalidAttemptTransitionError> {
    if (this._status !== 'IN_PROGRESS') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot answer a question on an attempt with status ${this._status}`,
        ),
      );
    }
    if (this._answeredQuestions.some((a) => a.questionId === props.questionId)) {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Question ${props.questionId} has already been answered`,
        ),
      );
    }

    this._answeredQuestions.push({
      questionId: props.questionId,
      text: props.text,
      verdict: props.verdict,
      answeredAt: props.at ?? new Date(),
    });
    return Result.ok();
  }

  /**
   * Check one sentence of a `sentence_schema` set.
   *
   * Where `answerQuestion` above records a decision, this records a state. The handoff
   * gives the student `Sjekk`, then `Rett opp (N)` with the correct pieces kept, and
   * unlimited retries — so being wrong here is a step in solving, not a verdict, and the
   * runner shows `Forsøk N` rather than a mark. What the attempt keeps is the running
   * count, the board as last checked, and whether the sentence is closed.
   *
   * The refusal is the point of the method, and it is a different refusal: not "you have
   * answered this already" but "this sentence is finished". A solved sentence locks, and
   * a revealed one locks harder — `Vis riktig skjema` puts the answer on the board, so
   * anything checked afterwards would be the answer handed back. A runner that only hides
   * the button is a runner one replayed request away from a revealed sentence scoring
   * full marks.
   *
   * Only while the attempt is open: a sentence checked after the set went in would be an
   * edit to work already graded.
   */
  checkRow(props: {
    rowId: string;
    placement: Record<string, string[]>;
    solved: boolean;
    revealed: boolean;
    /** When it was checked, if not now — a call replayed from the offline journal. */
    at?: Date;
  }): Result<CheckedRow, InvalidAttemptTransitionError> {
    if (this._status !== 'IN_PROGRESS') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot check a sentence on an attempt with status ${this._status}`,
        ),
      );
    }

    const existing = this._checkedRows.find((row) => row.rowId === props.rowId);
    if (existing && (existing.solved || existing.revealed)) {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Sentence ${props.rowId} is already ${existing.revealed ? 'revealed' : 'solved'}`,
        ),
      );
    }

    const checked: CheckedRow = {
      rowId: props.rowId,
      // A reveal is not an attempt at the sentence: the counter the student sees stands
      // still while the answer is shown to them.
      attempts: (existing?.attempts ?? 0) + (props.revealed ? 0 : 1),
      placement: props.placement,
      solved: props.solved,
      revealed: props.revealed,
      checkedAt: props.at ?? new Date(),
    };

    if (existing) this._checkedRows[this._checkedRows.indexOf(existing)] = checked;
    else this._checkedRows.push(checked);

    return Result.ok(checked);
  }

  /**
   * Pick one option of a `multiple_choice` set.
   *
   * The third of these methods and the one in between the other two. `answerQuestion`
   * records a decision that is final on the first try; `checkRow` records a state that
   * may be retried without limit; this records a state with a **budget**. The handoff
   * gives a question `settings.retry` attempts — none, one, or effectively unlimited —
   * and it closes when the pick is right, when the student asks to be shown the answer,
   * or when the budget runs out.
   *
   * The refusal is the point of the method, and plan 53 §3.3 states it as a rule about
   * the model rather than the UI: "a repeat answer past the attempt budget is refused by
   * the server, not by a greyed-out button". A runner that only hides the option is a
   * runner one replayed request away from a fourth try at a two-try question.
   *
   * Everything judged is judged by the caller, from the kernel and the current key: this
   * only counts, accumulates and locks. `eliminated` is written whole rather than
   * appended to, because the 50/50 is computed against the set already dimmed and the
   * kernel returns the cumulative result.
   *
   * A reveal is not an attempt at the question: it neither adds a pick nor spends a try,
   * exactly as a revealed sentence does not count as a check above. It closes the
   * question, and a closed question scores nothing it had not already earned.
   *
   * Only while the attempt is open: a question picked after the set went in would be an
   * edit to work already graded.
   */
  pickOption(props: {
    questionId: string;
    /** The option picked, or `null` when the student asked to be shown the answer. */
    optionId: string | null;
    correct: boolean;
    closed: boolean;
    revealed: boolean;
    /** The cumulative dimmed set from the kernel, or undefined to leave it as it stands. */
    eliminated?: readonly string[];
    /** When it was picked, if not now — a call replayed from the offline journal. */
    at?: Date;
  }): Result<PickedOption, InvalidAttemptTransitionError> {
    if (this._status !== 'IN_PROGRESS') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot answer a question on an attempt with status ${this._status}`,
        ),
      );
    }

    const existing = this._pickedOptions.find((q) => q.questionId === props.questionId);
    if (existing?.closed === true) {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Question ${props.questionId} is already ${
            existing.revealed ? 'revealed' : existing.correct ? 'answered' : 'out of attempts'
          }`,
        ),
      );
    }

    const picked: PickedOption = {
      questionId: props.questionId,
      picks:
        props.revealed || props.optionId === null
          ? [...(existing?.picks ?? [])]
          : [...(existing?.picks ?? []), props.optionId],
      eliminated: [...(props.eliminated ?? existing?.eliminated ?? [])],
      correct: props.correct,
      closed: props.closed,
      revealed: props.revealed,
      pickedAt: props.at ?? new Date(),
    };

    if (existing) this._pickedOptions[this._pickedOptions.indexOf(existing)] = picked;
    else this._pickedOptions.push(picked);

    return Result.ok(picked);
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
  review(props: ReviewVerdict & { reviewerId: string }): Result<
    void,
    InvalidScoreError | InvalidAttemptTransitionError | ReviewCommentRequiredError
  > {
    return this.deliver(props, props.reviewerId);
  }

  /**
   * A model's verdict (plan 79 §2.1, decision Q1; plan 80 §3).
   *
   * On the work of a learner nobody reviews it closes the attempt — the same two outcomes as
   * a teacher's, with two differences. Nobody signs it, so `deliveredVerdict` stays empty and
   * no colleague is named. And no letter is raised — `exercise.attempt.reviewed` says a
   * teacher answered, and here none did; the events that close the attempt say
   * `reviewedBy: 'ai'` instead, so progress records it and memory rates it as the weaker
   * evidence it is.
   *
   * On a school's work it is taken only where the school lets a model answer first (the
   * policy snapshotted at hand-in), and mostly it does not count yet: it is kept beside the
   * work as provisional, for the learner to read while a teacher's verdict — the one that
   * counts — is awaited. The memory is rated once, by whichever verdict is final. It closes
   * the attempt at once only in `ai_with_sampling`, on work the draw did not send to a
   * teacher, that the model credits, and where it does not contradict the auto-check (§3).
   *
   * `disagreesWithMachine`: the model ruled against an item the auto-check accepted.
   */
  reviewByAi(
    props: Omit<ReviewVerdict, 'aiDraft'>,
    opts: { disagreesWithMachine?: boolean } = {},
    now: Date = new Date(),
  ): Result<
    AiVerdictLanding,
    InvalidScoreError | InvalidAttemptTransitionError | ReviewCommentRequiredError
  > {
    if (this._schoolId === null) {
      return this.deliver(props, null).map(() => 'final' as const);
    }
    const policy = this._reviewAiPolicy;
    if (policy === null) {
      return Result.fail(
        new InvalidAttemptTransitionError('A model does not review work a teacher reviews'),
      );
    }
    if (this._status !== 'ROUTED_FOR_REVIEW') {
      return Result.fail(
        new InvalidAttemptTransitionError(
          `Cannot review an attempt with status ${this._status}`,
        ),
      );
    }
    // One model's answer per piece of work: the learner has read this one already, and a
    // second would change under them what they were told.
    if (this._provisionalAiVerdict !== null) {
      return Result.fail(
        new InvalidAttemptTransitionError('A model already answered this submission'),
      );
    }

    const credited = props.outcome === 'approved' && props.passed !== false;
    const toTeacher =
      policy.mode === 'ai_then_teacher' ||
      policy.teacherDrawn ||
      !credited ||
      opts.disagreesWithMachine === true;
    if (!toTeacher) {
      return this.deliver(props, null).map(() => 'final' as const);
    }

    if (!this.explained(props)) return Result.fail(new ReviewCommentRequiredError());
    if (props.outcome === 'approved') {
      const score = Score.create(props.score ?? 0);
      if (score.isFail) return Result.fail(score.error);
    }
    this._provisionalAiVerdict = { ...props, at: now };
    return Result.ok('provisional');
  }

  /**
   * A return is an instruction to try again, and one without a word on it is not an
   * instruction. Checked in the domain rather than at the edge so that no caller — the
   * queue, a batch, a model — can send work back silently.
   *
   * A note on every item ruled on is a word too: a `read_aloud` requires one per prompt and
   * has no field for the submission as a whole (plan 70 §3.6). A note on *some* items still
   * is not — the rest of the work would go back with nothing said about it.
   */
  private explained(props: Pick<ReviewVerdict, 'outcome' | 'comment' | 'decisions'>): boolean {
    if (props.outcome !== 'returned' || (props.comment ?? '').trim() !== '') return true;
    return (
      props.decisions.length > 0 &&
      props.decisions.every((decision) => (decision.comment ?? '').trim() !== '')
    );
  }

  /** Both verdicts. `reviewerId` is null for a model's. */
  private deliver(
    props: ReviewVerdict,
    reviewerId: string | null,
  ): Result<
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

    if (!this.explained(props)) return Result.fail(new ReviewCommentRequiredError());

    this._reviewedByUserId = reviewerId;
    this._reviewedAt = new Date();
    if (props.rubricMarks) {
      this._rubricMarks = props.rubricMarks;
    }
    this._reviewComment = props.comment;
    this._reviewDecisions = props.decisions;
    // Nobody is looking at this any more — it has been decided (plan 44 §44.8).
    this._reviewClaimedBy = null;
    this._reviewClaimedAt = null;

    if (props.outcome === 'returned') {
      this._status = 'RETURNED';

      // The work is not done and keeps no score — the learner has been asked to do it
      // again, and the letter to them says exactly that. What a person judged about their
      // language is another matter, and it is recorded (plan 63 §4): without this, a
      // failed free-form answer left no trace at all, and the only evidence ever
      // collected about recall and production was evidence of success.
      this.addDomainEvent(
        new AttemptReturnedEvent(this.id, {
          ...this.timing(this._reviewedAt),
          userId: this._userId,
          exerciseId: this._exerciseId,
          // What the verdict credited, on an approval's scale. Zero when nobody said —
          // a return with no item decisions is a return of the whole submission.
          score: props.score ?? 0,
          timeSpentSeconds: this._timeSpentSeconds,
          completed: false,
          passed: false,
          reviewOutcome: 'returned',
          ...(reviewerId === null ? { reviewedBy: 'ai' as const } : {}),
          practicedAtoms: this._practicedAtoms,
          skills: this._skills,
          focus: this._focus,
          containerId: this._containerId,
          workContext: this._workContext,
          ephemeral: this._ephemeral,
          groupId: this._groupId,
          lessonId: this._lessonId,
          templateCode: this._templateCode,
          modality: this._modality,
          ...(this.wholeExerciseTargets().length === 0
            ? {}
            : { targets: this.wholeExerciseTargets() }),
          ...(props.gapResults === undefined
            ? {}
            : { gapResults: this.addressed(props.gapResults) }),
          ...(props.evidenceLowered === true ? { evidenceLowered: true } : {}),
        }),
      );

      if (reviewerId !== null) this.addReviewedEvent({ ...props, reviewerId }, null);
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
        ...this.timing(this._scoredAt),
        userId: this._userId,
        exerciseId: this._exerciseId,
        score: this._score,
        timeSpentSeconds: this._timeSpentSeconds,
        completed: true,
        practicedAtoms: this._practicedAtoms,
        skills: this._skills,
        focus: this._focus,
        containerId: this._containerId,
        workContext: this._workContext,
        ephemeral: this._ephemeral,
        groupId: this._groupId,
        lessonId: this._lessonId,
        templateCode: this._templateCode,
        passed: this._passed,
        modality: this._modality,
        // A teacher's approval needs no special reading (`reviewOutcome` in the contract);
        // a model's does, and the contract never carries `reviewedBy` without it.
        ...(reviewerId === null
          ? { reviewOutcome: 'approved' as const, reviewedBy: 'ai' as const }
          : {}),
        // A free-form template grades as one, so the address it carries is the whole
        // exercise's — and this is the strongest evidence the platform has, because a
        // person read the answer.
        ...(this.wholeExerciseTargets().length === 0
          ? {}
          : { targets: this.wholeExerciseTargets() }),
        // …unless a person ruled on it item by item (a `read_aloud` prompt), in which case
        // each item's verdict travels with its own addresses, as a machine-graded gap does.
        ...(props.gapResults === undefined
          ? {}
          : { gapResults: this.addressed(props.gapResults) }),
        ...(props.evidenceLowered === true ? { evidenceLowered: true } : {}),
      }),
    );

    if (reviewerId !== null) this.addReviewedEvent({ ...props, reviewerId }, this._score);

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
      aiDraft?: AttemptReviewedAiDraft | null;
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
        aiDraft: props.aiDraft ?? null,
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
   * Who delivered the verdict this attempt carries (plan 79, 2.3): a person, a model for a
   * learner nobody reviews, or nobody — still waiting, closed as `NO_REVIEWER`, scored by
   * the machine.
   *
   * Only a delivery writes `reviewedAt`; a model's is the one without a signature. Read off
   * the status as well, because a returned attempt the learner resumes keeps both columns
   * from the verdict it is answering.
   */
  get reviewedBy(): 'teacher' | 'ai' | null {
    if (this._status !== 'SCORED' && this._status !== 'RETURNED') return null;
    if (this._reviewedByUserId !== null) return 'teacher';
    return this._reviewedAt === null ? null : 'ai';
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
  /** A copy: the list is append-only through `answerQuestion`, never from outside. */
  get answeredQuestions(): AnsweredQuestion[] { return [...this._answeredQuestions]; }
  /** A copy: rows are written only through `checkRow`. */
  get checkedRows(): CheckedRow[] { return this._checkedRows.map((row) => ({ ...row })); }
  /** A copy: questions are written only through `pickOption`. */
  get pickedOptions(): PickedOption[] {
    return this._pickedOptions.map((q) => ({ ...q, picks: [...q.picks], eliminated: [...q.eliminated] }));
  }
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
  /**
   * The addresses of the exercise as a whole — the item whose key is `null`.
   *
   * Separate from the per-gap addresses because there is no verdict to hang them on: for
   * a template that grades as one, the score of the attempt *is* the verdict.
   */
  private wholeExerciseTargets(): AttemptTarget[] {
    return this._itemTargets
      .filter((target) => target.itemKey === null)
      .map(({ atomType, atomId, role }) => ({ atomType, atomId, role }));
  }

  /** Each gap verdict with whatever this attempt snapshotted about that gap. */
  private addressed(
    gapResults: Array<{ gapKey: string; correct: boolean }>,
  ): Array<{ gapKey: string; correct: boolean; targets?: AttemptTarget[] }> {
    return gapResults.map((result) => {
      const targets = this._itemTargets
        .filter((target) => target.itemKey === result.gapKey)
        .map(({ atomType, atomId, role }) => ({ atomType, atomId, role }));
      // Absent, not empty: "nobody addressed this gap" and "this gap is about nothing"
      // are different statements, and only the first is true of the catalogue today.
      return targets.length === 0 ? result : { ...result, targets };
    });
  }

  get practicedAtoms(): PracticedAtom[] { return this._practicedAtoms; }
  get itemTargets(): AttemptItemTarget[] { return this._itemTargets; }
  get modality(): Modality { return this._modality; }
  /** This attempt was on a disposable probe — see `ephemeral` on the create props. */
  get ephemeral(): boolean { return this._ephemeral; }
  /**
   * The probes a `minimal_pairs` sitting plays, in order — `null` for every other template.
   * Untyped here as the column is: the kernel's `readDraw` is the one reader of it.
   */
  get probeDraw(): unknown { return this._probeDraw; }

  /**
   * The attempt was worked on a phone with no network, and at least one of its calls reached
   * the server replayed from the offline journal (VoxOrd offline plan, B4).
   */
  get recordedOffline(): boolean { return this._recordedOffline; }
  get reviewAiPolicy(): AttemptReviewAiPolicy | null { return this._reviewAiPolicy; }
  /**
   * The model's verdict that does not count yet (plan 80, step 3b). Kept after a teacher's
   * verdict too: what the model said beside what the teacher decided is the measure of it.
   */
  get provisionalAiVerdict(): ProvisionalAiVerdict | null { return this._provisionalAiVerdict; }
  /**
   * What the learner is told while a teacher's verdict is awaited after a model's (plan 80,
   * step 3b): the model's word, when it was given, and when it counts by itself. Null once
   * a verdict counts — the teacher's, or the model's at the term — and where none was given.
   */
  pendingAiVerdict(): PendingAiVerdict | null {
    const verdict = this._provisionalAiVerdict;
    if (this._status !== 'ROUTED_FOR_REVIEW' || verdict === null) return null;
    return {
      outcome: verdict.outcome,
      comment: verdict.comment,
      at: verdict.at,
      countsAt: this._reviewAiPolicy?.autoAcceptAt ?? null,
    };
  }

  markRecordedOffline(): void {
    this._recordedOffline = true;
  }

  /**
   * The latest moment recorded on the attempt. A call replayed from the offline journal is
   * never dated before it, so the attempt's own history stays in order whatever the phone's
   * clock did between two calls.
   */
  get lastActivityAt(): Date {
    const moments = [
      this._startedAt,
      this._draftSavedAt,
      this._submittedAt,
      this._scoredAt,
      ...this._answeredQuestions.map((a) => a.answeredAt),
      ...this._checkedRows.map((r) => r.checkedAt),
      ...this._pickedOptions.map((p) => p.pickedAt),
    ];
    let latest = this._startedAt;
    for (const moment of moments) {
      if (moment instanceof Date && moment.getTime() > latest.getTime()) latest = moment;
    }
    return latest;
  }

  /** `attemptedAt` and `recordedOffline` for an `exercise.attempt.completed` payload. */
  private timing(at: Date | null): AttemptTiming {
    return {
      ...(at === null ? {} : { attemptedAt: at.toISOString() }),
      ...(this._recordedOffline ? { recordedOffline: true } : {}),
    };
  }

  /**
   * Write the draw of a `minimal_pairs` sitting, once, before anything is answered (plan 72
   * §3.6). Which word is played in which place is decided when the attempt starts and never
   * again: the picks are recorded against probe numbers, so a second draw would move the
   * words under answers already given.
   */
  drawProbes(draw: unknown): Result<void, InvalidAttemptTransitionError> {
    if (this._probeDraw !== null) {
      return Result.fail(new InvalidAttemptTransitionError('The probes of this attempt are already drawn'));
    }
    if (this._status !== 'IN_PROGRESS' || this._pickedOptions.length > 0) {
      return Result.fail(
        new InvalidAttemptTransitionError('Probes are drawn before the first answer, on an open attempt'),
      );
    }
    this._probeDraw = draw;
    return Result.ok();
  }
  get skills(): Skill[] { return this._skills; }
  get focus(): Focus[] { return this._focus; }
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
  get workContext(): WorkContext | null { return this._workContext; }
  get lessonId(): string | null { return this._lessonId; }
  get groupId(): string | null { return this._groupId; }
  get exercisePath(): ExercisePathSnapshot | null { return this._exercisePath; }
  get reviewClaimedBy(): string | null { return this._reviewClaimedBy; }
  get reviewClaimedAt(): Date | null { return this._reviewClaimedAt; }
  get previousAttemptId(): string | null { return this._previousAttemptId; }
  get autoPassedItems(): number | null { return this._autoPassedItems; }
  get totalItems(): number | null { return this._totalItems; }
}
