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
import type { AttemptDomainError } from '../../../domain/exceptions/attempt.errors.js';
import { ReviewContextResolver } from '../../services/review-context-resolver.js';

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
  return undefined;
}

/**
 * The submission, with what the attempt knows about it written over what the client says.
 *
 * `sentence_schema` only, and about one field: `revealed`. `Vis riktig skjema` puts the
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

    const submittedAnswer = withRecordedReveals(attempt, command.submittedAnswer);

    // A practice attempt that has already been checked is reopened rather than
    // refused: checks are unlimited, and the attempt is the thing being worked on.
    // The entity decides whether this one may be — graded attempts and revealed
    // ones may not — and the refusal reaches the caller as it would for any
    // invalid transition.
    if (attempt.status === 'SCORED') {
      const reopened = attempt.reopenForRecheck();
      if (reopened.isFail) {
        return Result.fail(reopened.error as AttemptDomainError);
      }
    }

    const answerHash = createHash('sha256')
      .update(JSON.stringify(submittedAnswer))
      .digest('hex');

    const submitResult = attempt.submit(submittedAnswer, answerHash);
    if (submitResult.isFail) {
      return Result.fail(submitResult.error as AttemptDomainError);
    }

    // Fetch exercise definition for validation. Always requested as PRACTICE — the
    // server needs the real expectedAnswers to score regardless of the attempt's
    // checkMode; GRADED only changes what the *client* was shown at start-attempt
    // and whether the answer may be revealed in feedback below.
    const defResult = await this.contentClient.getExerciseForAttempt(
      attempt.exerciseId,
      attempt.targetLanguage,
      'PRACTICE',
    );
    if (defResult.isFail) {
      return Result.fail(defResult.error);
    }
    const def = defResult.value;

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
        // A routed submission is where `translate_*` spends most of its life, and the
        // split it carries — approved outright vs waiting for a teacher — is per
        // sentence. Withholding it here would leave the runner able to say only that
        // *something* went to a teacher.
        details: learnerFacingDetails(attempt.templateCode, outcome.details),
      });
    }

    const passed = outcome.score >= passingThreshold;
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
    });
  }

  private async publishEvents(attempt: import('../../../domain/entities/attempt.entity.js').Attempt): Promise<void> {
    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();
  }
}
