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
import type { AnswerForm, Focus, Skill } from '@ssz/contracts';
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

/** What an exercise trains, as Content Service resolved it at attempt start (plan 55 §3.6). */
export interface AttemptAxes {
  skills: Skill[];
  focus: Focus[];
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
  axes: AttemptAxes;
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
    private _answeredQuestions: AnsweredQuestion[] = [],
    private _checkedRows: CheckedRow[] = [],
    private _pickedOptions: PickedOption[] = [],
    // Appended at the tail like every field added after the fact — the constructor is
    // positional, and the alternative is renumbering every call site (plan 55 §3.6).
    private _skills: Skill[] = [],
    private _focus: Focus[] = [],
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

    attempt._skills = props.axes.skills;
    attempt._focus = props.axes.focus;

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
          skills: this._skills,
          focus: this._focus,
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
        skills: this._skills,
        focus: this._focus,
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
      answeredAt: new Date(),
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
      checkedAt: new Date(),
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
      pickedAt: new Date(),
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
    /**
     * The marks a teacher set, for the submissions graded out of a rubric.
     *
     * Kept on both outcomes: work sent back was still read criterion by criterion, and
     * the learner's next draft is answering those marks.
     */
    rubricMarks?: RubricMarks | null;
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
        skills: this._skills,
        focus: this._focus,
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
  get practicedAtoms(): PracticedAtom[] { return this._practicedAtoms; }
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
  get groupId(): string | null { return this._groupId; }
  get exercisePath(): ExercisePathSnapshot | null { return this._exercisePath; }
  get reviewClaimedBy(): string | null { return this._reviewClaimedBy; }
  get reviewClaimedAt(): Date | null { return this._reviewClaimedAt; }
  get previousAttemptId(): string | null { return this._previousAttemptId; }
  get autoPassedItems(): number | null { return this._autoPassedItems; }
  get totalItems(): number | null { return this._totalItems; }
}
