import { createHash } from 'node:crypto';
import type { AnswerForm } from '@ssz/contracts';
import {
  bank,
  readContent,
  TEMPLATE_CODE as WORD_BANK_GAP_FILL,
} from '@ssz/shared-kernel/wordbank-gapfill';
import { TEMPLATE_CODE as MATCH_PAIRS } from '@ssz/shared-kernel/match-pairs';
import { isTranslateCode } from '@ssz/shared-kernel/translate';
import { TEMPLATE_CODE as SHORT_ANSWER } from '@ssz/shared-kernel/short-answer';
import { TEMPLATE_CODE as SENTENCE_SCHEMA } from '@ssz/shared-kernel/sentence-schema';
import { TEMPLATE_CODE as MULTIPLE_CHOICE } from '@ssz/shared-kernel/multiple-choice';
import {
  maxAttempts as mcgMaxAttempts,
  readContent as mcgReadContent,
  TEMPLATE_CODE as MULTIPLE_CHOICE_GROUP,
} from '@ssz/shared-kernel/multiple-choice-group';
import {
  fromPersisted as writingTaskFromPersisted,
  snapshotRubric,
  TEMPLATE_CODE as WRITING_TASK,
} from '@ssz/shared-kernel/writing-task';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { SubmitAnswerCommand } from './submit-answer.command.js';
import { ATTEMPT_REPOSITORY, type IAttemptRepository } from '../../../domain/repositories/attempt.repository.js';
import { CONTENT_CLIENT, type IContentClient, ContentClientError } from '../../../../../shared/application/ports/content-client.port.js';
import { ANSWER_VALIDATOR, type IAnswerValidator, ValidationError } from '../../../../../shared/application/ports/answer-validator.port.js';
import { FEEDBACK_GENERATOR, type IFeedbackGenerator } from '../../../../../shared/application/ports/feedback-generator.port.js';
import { EVENT_PUBLISHER, type IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { Attempt } from '../../../domain/entities/attempt.entity.js';
import { InvalidAttemptTransitionError } from '../../../domain/exceptions/attempt.errors.js';
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';
import { ReviewContextResolver } from '../../services/review-context-resolver.js';
import { audioTranscriptFor, type AudioTranscript } from '../../services/audio-transcript.js';

export type SubmitAnswerError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  | ValidationError
  | ContentClientError
  | AttemptDomainError;

export interface SubmitAnswerResult {
  attemptId: string;
  correct: boolean;
  score: number | null;
  requiresReview: boolean;
  feedback: { summary: string; hints?: string[]; correctAnswer?: unknown };
  /** Per-item verdicts for the templates graded item by item, and nothing for the rest. */
  details?: unknown;
  /**
   * What the clip said (plan 56 §3.3). Only for a listening exercise whose teacher set
   * the transcript to show after the answer — this is the hand-in, so the exercise is
   * over and there is nothing left to give away.
   */
  audioTranscript?: AudioTranscript;
}

/**
 * The validator's details, but only where they are meant for the learner.
 *
 * `word_bank_gap_fill` is graded per gap, and its details are exactly what the student
 * is owed after a check: right or wrong, and the explanation the teacher wrote for the
 * word they actually chose. Nothing in there is an answer.
 *
 * `match_pairs` is the same case one template later, and it is the whole point of the
 * type: being wrong is supposed to yield the teacher's explanation for the half the
 * student actually attached, not the half they should have. Its details carry
 * `totalPairs`, `correctPairs` and one `{ pairId, correct, explanation }` per *filled*
 * slot — no `rightId` of the correct half, no `why`, no row of the feedback matrix the
 * student did not hit. Slots left empty are absent rather than wrong, which says
 * nothing either. See `match-pairs.validator.ts` and docs/plan/49-match-pairs.md.
 *
 * The other validators' details are diagnostics, and several of them do contain the
 * answer — `multiple_choice` reports `expected`, `short_answer` reports `target`.
 * Returning them all would hand the answer to anyone who opened the network tab, so
 * this is a per-template allowance rather than a field that is simply forwarded.
 *
 * `translate_*` is the middle case: its details are written for the teacher queue and
 * carry the key outright (`ref`, and a diff whose `missing` words are the key's), so
 * they cannot travel — but the learner is owed the one thing this template decides
 * automatically, which sentences closed on a hit and which went to a teacher. That much
 * is stripped out below.
 *
 * `sentence_schema` travels whole, like the two above it and for the same reason: its
 * details are marks rather than the key. Which piece went wrong and how — `field`,
 * `order`, `extra` — is what the student is owed after a check, and the sentence, the
 * rule and the per-chunk notes are not in there. They reach the runner from `check-row`
 * instead, one sentence at a time, and only once that sentence is closed.
 *
 * `short_answer` is the same case again and the sharpest of them: every element in its
 * details carries the anchor phrase that matched, and the anchors are the answer written
 * in the words the student was asked to find. The student has already been told about
 * each question one at a time, by `answer-question`, through the kernel's own result
 * projection; what submitting adds is the tally that closes the set, so that is all that
 * is stripped out here.
 */
function learnerFacingDetails(templateCode: string, details: unknown): unknown {
  if (templateCode === WORD_BANK_GAP_FILL) return details;
  if (templateCode === MATCH_PAIRS) return details;
  if (isTranslateCode(templateCode)) return translateRouting(details);
  if (templateCode === SHORT_ANSWER) return shortAnswerVerdicts(details);
  if (templateCode === SENTENCE_SCHEMA) return details;
  // `multiple_choice_group` travels whole, and unusually it is the *validator* that
  // decided how much of the key belongs in it rather than this function. A check reports
  // which statements are wrong on every pass; the right column, the author's line and the
  // proving quote appear only once the table is closed — all right, revealed, or out of
  // attempts — because sending them beside a row that still has a retry left would make
  // the retry theatre (plan 54 §3.3, README "showKey = closed && settings.revealKey").
  // What is added here beyond the verdicts is the state the runner draws from: how many
  // checks are left, and which rows the server has frozen.
  if (templateCode === MULTIPLE_CHOICE_GROUP) return details;
  return undefined;
}

/**
 * The submission, with what the attempt knows about it written over what the client says.
 *
 * Two templates work through a set in place, and both keep facts on the server that the
 * submission cannot be trusted to carry. `multiple_choice` is handled wholesale below;
 * this is `sentence_schema`, and it is about one field: `revealed`. `Vis riktig skjema` puts the
 * answer on the board, and a revealed sentence scores nothing (plan 52 §3.4) — so a client
 * that could reveal a sentence and then submit the board it was just shown with the flag
 * left off would have found the cheapest route to a full score. The reveal was recorded on
 * the attempt when it happened; that record wins.
 *
 * It only ever adds reveals. A client claiming to have revealed a sentence it did not is
 * claiming a worse score, and there is nothing to defend against there.
 *
 * Everything else in the submission is the learner's own work and is taken as sent.
 */
function withRecordedReveals(attempt: Attempt, submitted: unknown): unknown {
  if (attempt.templateCode === MULTIPLE_CHOICE) return withRecordedPicks(attempt, submitted);
  if (attempt.templateCode === MULTIPLE_CHOICE_GROUP) return withRecordedChecks(attempt, submitted);
  if (attempt.templateCode !== SENTENCE_SCHEMA) return submitted;

  const revealed = new Set(
    attempt.checkedRows.filter((row) => row.revealed).map((row) => row.rowId),
  );
  if (revealed.size === 0) return submitted;

  const rows = (submitted as { rows?: unknown })?.rows;
  if (!Array.isArray(rows)) return submitted;

  return {
    ...(submitted as Record<string, unknown>),
    rows: rows.map((row) => {
      const rowId = (row as { rowId?: unknown })?.rowId;
      return typeof rowId === 'string' && revealed.has(rowId)
        ? { ...(row as Record<string, unknown>), revealed: true }
        : row;
    }),
  };
}

/**
 * The picks of a `multiple_choice` set, taken from the attempt rather than from the body.
 *
 * A replacement, not an overlay — which is where this parts company with the reveals
 * above. Every field of a pick is answer-bearing: which option was chosen decides whether
 * the question was right, and **which try it was chosen on decides whether it scores**,
 * since only a first-attempt hit counts (plan 53 §3.5). A client that could send its own
 * `attempt: 1` beside a second-try answer would be scoring itself.
 *
 * It can be a replacement because there is nothing else for the client to contribute:
 * every pick reached the server through `answer-question` as it was made, was judged
 * there, and was written onto the attempt. A question missing from this list is one the
 * student never answered, which the kernel counts as wrong — the same thing a client
 * omitting it would have meant.
 *
 * A resubmission of an old-form document is left alone: it has no per-question state and
 * is graded from its own body, as it always was.
 */
function withRecordedPicks(attempt: Attempt, submitted: unknown): unknown {
  const picked = attempt.pickedOptions;
  if (picked.length === 0) return submitted;

  return {
    answers: picked.map((q) => ({
      questionId: q.questionId,
      // A revealed question has no pick to score. Null rather than the last option they
      // tried: they were shown the answer, and the answer is not theirs.
      optionId: q.revealed ? null : (q.picks[q.picks.length - 1] ?? null),
      attempt: Math.max(1, q.picks.length),
    })),
  };
}

/**
 * The verdict of each question and the tally over the set, and nothing else.
 *
 * An allowlist rather than a redaction: the fields are named one by one, so a field added
 * to the teacher's row later cannot leak by being forgotten here. Everything left behind
 * — the element labels, the phrase that matched each one, the author's model answer —
 * either is the key or points straight at it.
 *
 * The completion screen is what this feeds: `N godkjent · N delvis · N ikke godkjent`.
 * The runner could count that itself from the per-question replies it already holds, and
 * this is deliberately the server's count instead — it is the one recomputed against the
 * key as it stands now.
 *
 * That tally is counted here, from the verdicts, rather than taken from the validator's
 * `passedItems`. The two are not the same number and only look alike: `passedItems`
 * counts questions the *check* closed, and under `teacherReview: 'all'` it is zero over
 * three flawless answers, because every one of them still goes to a person. `passedItems`
 * travels on unchanged for the routing line — how much of this went to a teacher — while
 * `verdicts` is what the three counters read.
 */
function shortAnswerVerdicts(details: unknown): unknown {
  if (typeof details !== 'object' || details === null) return undefined;

  const { items, totalItems, passedItems, routedItems } = details as {
    items?: unknown;
    totalItems?: unknown;
    passedItems?: unknown;
    routedItems?: unknown;
  };
  if (!Array.isArray(items)) return undefined;

  const verdictOf = (item: unknown): unknown => (item as { verdict?: unknown }).verdict;

  return {
    totalItems,
    passedItems,
    routedItems,
    verdicts: {
      pass: items.filter((item) => verdictOf(item) === 'pass').length,
      partial: items.filter((item) => verdictOf(item) === 'partial').length,
      fail: items.filter((item) => verdictOf(item) === 'fail').length,
    },
    items: items.map((item) => {
      const { itemId, verdict, covered, total, tooShort, routing } = item as {
        itemId: string;
        verdict: string | null;
        covered: number;
        total: number;
        tooShort: boolean;
        routing: string;
      };
      return { itemId, verdict, covered, total, tooShort, routing };
    }),
  };
}

/**
 * The routing of each sentence, and nothing else.
 *
 * Every other field of a translate detail describes the key or the distance to it. The
 * routing describes what happened to the submission, which the student is looking at
 * anyway: the badge on the card after handing in.
 */
function translateRouting(details: unknown): unknown {
  if (typeof details !== 'object' || details === null) return undefined;

  const { items, totalItems, passedItems } = details as {
    items?: unknown;
    totalItems?: unknown;
    passedItems?: unknown;
  };
  if (!Array.isArray(items)) return undefined;

  return {
    totalItems,
    passedItems,
    items: items.map((item) => {
      const { itemId, routing } = item as { itemId: string; routing: string };
      return { itemId, routing };
    }),
  };
}

/**
 * How the learner produced the answer, as opposed to whether it was right.
 *
 * Carried because `word_bank_gap_fill` absorbed `fill_in_blank`: one template now
 * covers both choosing a word out of five and typing it from memory. Those are not
 * equal evidence of knowing it, and after the merge no `templateCode` distinguishes
 * them — so without this, merging the types would make spaced repetition *worse*.
 *
 * Only this template can say. The other twelve report nothing and the field is absent,
 * which is what keeps events published before it existed valid.
 */
function describeAnswerForm(templateCode: string, content: unknown): AnswerForm | undefined {
  if (templateCode !== WORD_BANK_GAP_FILL) return undefined;

  const task = readContent(content);
  const typed = task.settings.input === 'free';
  return {
    mode: typed ? 'free' : 'bank',
    bankSize: typed ? null : bank(task).length,
    wordsConsumed: !task.settings.allowReuse,
  };
}

/**
 * The per-gap verdicts, for the templates graded gap by gap (plan 36 §C.1).
 *
 * Lifted out of the validator's details rather than recomputed: the details already
 * carry exactly this, in gap order, and a second opinion on "was this gap right" is
 * how two answers to the same question start to drift.
 *
 * Only the verdict travels. The explanation in the same record is feedback owed to
 * the learner; the scheduler has no use for it, and events are not the place to put
 * text that nothing reads.
 */
function describeGapResults(
  templateCode: string,
  details: unknown,
): Array<{ gapKey: string; correct: boolean }> | undefined {
  if (templateCode !== WORD_BANK_GAP_FILL) return undefined;
  if (typeof details !== 'object' || details === null) return undefined;

  const { gaps } = details as { gaps?: unknown };
  if (!Array.isArray(gaps)) return undefined;

  return gaps.map((gap) => {
    const { gapKey, correct } = gap as { gapKey: string; correct: boolean };
    return { gapKey, correct };
  });
}

/**
 * What the previous check of a `multiple_choice_group` table left behind.
 *
 * Read off the attempt's own `validationDetails`, which is where the validator wrote it,
 * and which is the reason this template needs no column of its own. Plans 51, 52 and 53
 * each added one — `answered_questions`, `checked_rows`, `picked_options` — because in
 * those types the work is handed in piece by piece and the server has to remember where
 * the student got to. Here the unit of submission is the whole table, so there is nothing
 * half-done to remember between requests: everything a second check needs was already
 * decided by the first one and written down when it scored (plan 54 §3.3).
 *
 * Three facts come back out:
 *
 *   * `closed` — the table was finished by the last check (all right, revealed, or out of
 *     attempts), so there is no further check to allow;
 *   * `locked` — the rows frozen under `lockCorrect`, cumulative;
 *   * `firstAnswers` — what was picked on the *first* check of this table.
 *
 * The last is the answer to plan 54 §8 Q4, and not the one Q4 proposed. Option A assumed
 * the first check's details would still be there to read: they are not — `score()` writes
 * `validationDetails` afresh every time, so a re-check overwrites them. Option B was a
 * column on the attempt. What happens instead is that the value is *carried forward*: each
 * check copies the previous check's `firstAnswer` per row into its own details, so the
 * first pass survives in the latest record without a migration and without a second place
 * to keep it. IMPLEMENTATION.md asks for `firstAnswer` because per-row first-attempt error
 * rates are what say whether a cohort understood the text; where it is stored was never
 * the point.
 */
interface PreviousCheck {
  closed: boolean;
  locked: string[];
  firstAnswers: Record<string, string | null>;
}

function previousCheck(attempt: Attempt): PreviousCheck {
  const empty: PreviousCheck = { closed: false, locked: [], firstAnswers: {} };
  const details = attempt.validationDetails;
  if (typeof details !== 'object' || details === null) return empty;

  const { closed, locked, items } = details as {
    closed?: unknown;
    locked?: unknown;
    items?: unknown;
  };

  const firstAnswers: Record<string, string | null> = {};
  if (Array.isArray(items)) {
    for (const raw of items) {
      if (typeof raw !== 'object' || raw === null) continue;
      const { itemId, firstAnswer } = raw as { itemId?: unknown; firstAnswer?: unknown };
      if (typeof itemId !== 'string') continue;
      firstAnswers[itemId] = typeof firstAnswer === 'string' ? firstAnswer : null;
    }
  }

  return {
    closed: closed === true,
    locked: Array.isArray(locked) ? locked.filter((id): id is string => typeof id === 'string') : [],
    firstAnswers,
  };
}

/**
 * A `multiple_choice_group` submission with the attempt's own facts written over it.
 *
 * Three of the four inputs the grader needs are not the client's to state, and each of
 * them is worth one request to a client that could: which check this is (the budget),
 * which rows are frozen (`lockCorrect`), and what was picked the first time round. The
 * fourth, `reveal`, *is* the student's — «Vis fasit» is giving up on the retry, and it
 * closes the table with the score it already had.
 */
function withRecordedChecks(attempt: Attempt, submitted: unknown): unknown {
  const previous = previousCheck(attempt);
  const base =
    typeof submitted === 'object' && submitted !== null && !Array.isArray(submitted)
      ? (submitted as Record<string, unknown>)
      : {};

  return {
    ...base,
    // `recheckCount` has already been incremented for this check by the time this runs,
    // so the first check is 1 and the first re-check is 2 — the numbering the attempt
    // budget is written in (`maxAttempts`).
    attempt: attempt.recheckCount + 1,
    locked: previous.locked,
    firstAnswers: previous.firstAnswers,
  };
}

/**
 * The number of checks this attempt is allowed, or `undefined` for unlimited.
 *
 * `word_bank_gap_fill` is unlimited by its own spec and is why `reopenForRecheck` exists
 * at all. `multiple_choice_group` brought a budget with it: `settings.retry` is 1, 2 or 99
 * checks of the whole table, and the setting is the author's, read off the document rather
 * than off the attempt — the learner is working under the setting as it stands now.
 */
function recheckBudget(templateCode: string, content: unknown): number | undefined {
  if (templateCode !== MULTIPLE_CHOICE_GROUP) return undefined;
  return mcgMaxAttempts(mcgReadContent(content).settings);
}

/**
 * The refusal that the budget cannot express: a table the last check *closed*.
 *
 * A table closes for three reasons and only one of them is the budget running out. The
 * other two — every row right, and «Vis fasit» — leave checks unspent, and without this a
 * student who revealed the key could then spend them on the answers they had just been
 * shown.
 */
function refuseClosedTable(attempt: Attempt): InvalidAttemptTransitionError | null {
  if (attempt.templateCode !== MULTIPLE_CHOICE_GROUP) return null;
  if (!previousCheck(attempt).closed) return null;
  return new InvalidAttemptTransitionError('This table is closed and cannot be checked again');
}

/**
 * How much the validator closed by itself, out of how many items.
 *
 * Written onto the attempt when it routes for review so the queue can show "the
 * machine already accepted all of this" without re-running the validator over every
 * row on the page. A hint only (plan 44 §0.3) — a verdict recomputes the parse.
 *
 * The templates that route per sentence report both numbers themselves. The rest —
 * a `short_answer` the checker could not decide, a `writing_task` there was never
 * anything to decide about — are one item that no machine passed.
 */
function machineTally(details: unknown): { autoPassedItems: number; totalItems: number } {
  if (typeof details === 'object' && details !== null) {
    const { totalItems, passedItems } = details as {
      totalItems?: unknown;
      passedItems?: unknown;
    };
    if (typeof totalItems === 'number' && typeof passedItems === 'number') {
      return { autoPassedItems: passedItems, totalItems };
    }
  }

  return { autoPassedItems: 0, totalItems: 1 };
}

/**
 * The rubric a submission will be graded against, frozen as it reaches the queue.
 *
 * `writing_task` only: it is the one template a person grades out of criteria rather
 * than out of items (plan 50 §3.2). Every other template routes with `null` and is
 * scored exactly as before.
 *
 * Assembled from both columns because the level descriptors live in `expected_answers`
 * (the kernel's persistence.ts) and the queue draws them beside each mark. A malformed
 * exercise costs the snapshot, not the submission: the student's text is already
 * written, and refusing it here to report the author's bug would throw the work away.
 */
function rubricFor(templateCode: string, content: unknown, expectedAnswers: unknown): RubricSnapshot | null {
  if (templateCode !== WRITING_TASK) return null;

  const document = writingTaskFromPersisted(
    { id: '', moduleId: '', title: '', updatedAt: '' },
    content,
    expectedAnswers,
  );

  return document.rubric.length === 0 ? null : snapshotRubric(document);
}

@CommandHandler(SubmitAnswerCommand)
export class SubmitAnswerHandler implements ICommandHandler<SubmitAnswerCommand> {
  constructor(
    @Inject(ATTEMPT_REPOSITORY) private readonly attempts: IAttemptRepository,
    @Inject(CONTENT_CLIENT) private readonly contentClient: IContentClient,
    @Inject(ANSWER_VALIDATOR) private readonly validator: IAnswerValidator,
    @Inject(FEEDBACK_GENERATOR) private readonly feedbackGenerator: IFeedbackGenerator,
    @Inject(EVENT_PUBLISHER) private readonly publisher: IEventPublisher,
    private readonly reviewContext: ReviewContextResolver,
  ) {}

  async execute(
    command: SubmitAnswerCommand,
  ): Promise<Result<SubmitAnswerResult, SubmitAnswerError>> {
    const attempt = await this.attempts.findById(command.attemptId);
    if (!attempt) {
      return Result.fail({ code: 'ATTEMPT_NOT_FOUND' });
    }
    if (attempt.userId !== command.userId) {
      return Result.fail({ code: 'FORBIDDEN' });
    }

    attempt.addTimeSpent(command.timeSpentSeconds);

    // Fetched before anything is decided, rather than after the submission is written
    // onto the attempt. Always requested as PRACTICE — the server needs the real
    // expectedAnswers to score regardless of the attempt's checkMode; GRADED only
    // changes what the *client* was shown at start-attempt and whether the answer may
    // be revealed in feedback below. It moved up here because the recheck budget is a
    // setting on the document, and the budget is spent before the answer is taken.
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }
    const def = defResult.value;

    // A practice attempt that has already been checked is reopened rather than
    // refused: the attempt is the thing being worked on. The entity decides whether
    // this one may be — graded attempts, revealed ones, and now ones whose budget is
    // spent — and the refusal reaches the caller as it would for any invalid
    // transition.
    if (attempt.status === 'SCORED') {
      const closed = refuseClosedTable(attempt);
      if (closed) return Result.fail(closed);

      const reopened = attempt.reopenForRecheck(
        recheckBudget(attempt.templateCode, def.exercise.content),
      );
      if (reopened.isFail) {
        return Result.fail(reopened.error as AttemptDomainError);
      }
    }

    // After the reopen, deliberately: the facts written over the submission include
    // which check this is, and `recheckCount` is only current once it has happened.
    const submittedAnswer = withRecordedReveals(attempt, command.submittedAnswer);

    const answerHash = createHash('sha256')
      .update(JSON.stringify(submittedAnswer))
      .digest('hex');

    const submitResult = attempt.submit(submittedAnswer, answerHash);
    if (submitResult.isFail) {
      return Result.fail(submitResult.error as AttemptDomainError);
    }

    const checkSettings: Record<string, unknown> = {
      ...(def.template.defaultCheckSettings ?? {}),
      ...(def.exercise.answerCheckSettings ?? {}),
    };

    const validationResult = await this.validator.validate({
      templateCode: attempt.templateCode,
      answerSchema: def.template.answerSchema as object,
      expectedAnswers: def.exercise.expectedAnswers,
      content: def.exercise.content,
      submittedAnswer,
      checkSettings,
      targetLanguage: attempt.targetLanguage,
    });

    if (validationResult.isFail) {
      return Result.fail(validationResult.error);
    }

    const outcome = validationResult.value;
    const passingThreshold = (checkSettings['passingThreshold'] as number | undefined) ?? 70;

    if (outcome.requiresReview) {
      // Last chance to learn where this belongs: the attempt may have started
      // before the review columns existed, or while a neighbour was down. After
      // this it is a row in someone's queue, and a row nobody can see is lost.
      if (!attempt.schoolId || !attempt.containerId || !attempt.groupId) {
        attempt.backfillReviewContext(
          await this.reviewContext.resolve(attempt.userId, attempt.exerciseId),
        );
      }

      const routeResult = attempt.routeForReview(
        machineTally(outcome.details),
        rubricFor(attempt.templateCode, def.exercise.content, def.exercise.expectedAnswers),
      );
      if (routeResult.isFail) {
        return Result.fail(routeResult.error as AttemptDomainError);
      }

      await this.attempts.save(attempt);
      await this.publishEvents(attempt);

      return Result.ok<SubmitAnswerResult, SubmitAnswerError>({
        attemptId: attempt.id,
        correct: false,
        score: null,
        requiresReview: true,
        feedback: { summary: 'Your answer has been submitted for review.' },
        audioTranscript: audioTranscriptFor(def.exercise.content, true),
        // A routed submission is where `translate_*` spends most of its life, and the
        // split it carries — approved outright vs waiting for a teacher — is per
        // sentence. Withholding it here would leave the runner able to say only that
        // *something* went to a teacher.
        details: learnerFacingDetails(attempt.templateCode, outcome.details),
      });
    }

    // The platform's threshold, unless the validator knows a better one. Only
    // `multiple_choice_group` does: its pass mark is a field of the document the author
    // set in step 3 and the student is shown as «kravet er T%» (plan 54 §3.4).
    const passed = outcome.passed ?? outcome.score >= passingThreshold;
    const feedbackResult = await this.feedbackGenerator.generate({
      templateCode: attempt.templateCode,
      correct: outcome.correct,
      score: outcome.score,
      validationDetails: outcome.details,
      exerciseDefinition: {
        exercise: def.exercise,
        template: def.template,
        instruction: def.instruction,
      },
      locale: command.locale,
      revealAnswer: attempt.checkMode === 'PRACTICE',
    });
    const feedback = feedbackResult.isOk
      ? feedbackResult.value
      : { summary: outcome.correct ? 'Correct!' : 'Incorrect. Please try again.' };

    const answerForm = describeAnswerForm(attempt.templateCode, def.exercise.content);
    const gapResults = describeGapResults(attempt.templateCode, outcome.details);
    const scoreResult = attempt.score(
      outcome.score,
      passed,
      outcome.details,
      feedback,
      answerForm,
      gapResults,
    );
    if (scoreResult.isFail) {
      return Result.fail(scoreResult.error as AttemptDomainError);
    }

    await this.attempts.save(attempt);
    await this.publishEvents(attempt);

    return Result.ok<SubmitAnswerResult, SubmitAnswerError>({
      attemptId: attempt.id,
      correct: outcome.correct,
      score: outcome.score,
      requiresReview: false,
      feedback,
      details: learnerFacingDetails(attempt.templateCode, outcome.details),
      audioTranscript: audioTranscriptFor(def.exercise.content, true),
    });
  }

  private async publishEvents(attempt: import('../../../domain/entities/attempt.entity.js').Attempt): Promise<void> {
    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();
  }
}
