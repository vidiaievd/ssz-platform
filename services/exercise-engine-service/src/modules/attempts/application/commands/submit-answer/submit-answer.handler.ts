import { createHash } from 'node:crypto';
import type { AnswerForm } from '@ssz/contracts';
import {
  bank,
  readContent,
  TEMPLATE_CODE as WORD_BANK_GAP_FILL,
} from '@ssz/shared-kernel/wordbank-gapfill';
import {
  ceilingCause as sbCeilingCause,
  fromPersisted as sbFromPersisted,
  TEMPLATE_CODE as SORT_INTO_BUCKETS,
} from '@ssz/shared-kernel/sort-into-buckets';
import {
  ceilingCause as htCeilingCause,
  fromPersisted as htFromPersisted,
  TEMPLATE_CODE as HIGHLIGHT_IN_TEXT,
} from '@ssz/shared-kernel/highlight-in-text';
import {
  ceilingCause as dcCeilingCause,
  fromPersisted as dcFromPersisted,
  TEMPLATE_CODE as DICTATION,
} from '@ssz/shared-kernel/dictation';
import {
  bankForms as itBankForms,
  ceilingCause as itCeilingCause,
  fromPersisted as itFromPersisted,
  TEMPLATE_CODE as INFLECTION_TABLE,
} from '@ssz/shared-kernel/inflection-table';
import {
  fromPersisted as writingTaskFromPersisted,
  snapshotRubric,
  TEMPLATE_CODE as WRITING_TASK,
} from '@ssz/shared-kernel/writing-task';
import type { RubricSnapshot } from '@ssz/shared-kernel/writing-task';
import {
  freshPart as raFreshPart,
  fromPersisted as raFromPersisted,
  snapshotOf as raSnapshotOf,
  TEMPLATE_CODE as READ_ALOUD,
  withCarried as raWithCarried,
} from '@ssz/shared-kernel/read-aloud';
import type { Submission as RaSubmission } from '@ssz/shared-kernel/read-aloud';
import {
  filledWords as mpFilledWords,
  fromPersisted as mpFromPersisted,
  TEMPLATE_CODE as MINIMAL_PAIRS,
} from '@ssz/shared-kernel/minimal-pairs';
import { playbackOf } from '../../services/minimal-pairs-sitting.js';
import {
  TEMPLATE_CODE as INFORMATION_TRANSFER,
} from '@ssz/shared-kernel/information-transfer';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject, Optional } from '@nestjs/common';
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
import { ReviewerResolver, type Reviewer } from '../../services/reviewer-resolver.js';
import { audioTranscriptFor, type AudioTranscript } from '../../services/audio-transcript.js';
import { firstVerdictsIn, isItemByItem } from '../../services/item-states.js';
import { CLOCK, SystemClock, type IClock } from '../../../../../shared/application/ports/clock.port.js';
import { stampReplayedCall } from '../../../../../shared/application/services/client-time.js';
import { MEDIA_ASSETS, type IMediaAssets } from '../../../../../shared/application/ports/media-assets.port.js';
import {
  assetIdsOf,
  carriedInto,
  checkAssets,
  checkPrompts,
  readRecordings,
} from '../../services/read-aloud-recordings.js';

import {
  ATTEMPT_STATE_REFUSALS,
  closesTable,
  learnerFacingDetails,
  recheckBudget,
  revealedFeedback,
  transcriptOwed,
  withRecordedReveals,
} from './submit-facts.js';

export type SubmitAnswerError =
  | { code: 'ATTEMPT_NOT_FOUND' }
  | { code: 'FORBIDDEN' }
  /**
   * The recordings of a `read_aloud` could not be checked because media-service did not
   * answer (plan 70 §3.5, RA-U10). Nothing was written: the draft is where it was.
   */
  | { code: 'MEDIA_UNAVAILABLE' }
  | ValidationError
  | ContentClientError
  | AttemptDomainError;

export interface SubmitAnswerResult {
  attemptId: string;
  correct: boolean;
  score: number | null;
  requiresReview: boolean;
  /**
   * Who will read work that `requiresReview` (plan 79, step 2.1c): the school's teacher, a
   * model, or nobody — the last closes the attempt as `NO_REVIEWER`, and the client says so
   * instead of «sent for review». Absent when nothing went to review.
   */
  reviewer?: Reviewer;
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
 * How the learner produced the answer, as opposed to whether it was right.
 *
 * Carried because `word_bank_gap_fill` absorbed `fill_in_blank`: one template now
 * covers both choosing a word out of five and typing it from memory. Those are not
 * equal evidence of knowing it, and after the merge no `templateCode` distinguishes
 * them — so without this, merging the types would make spaced repetition *worse*.
 *
 * Only this template can say. The other twelve report nothing and the field is absent,
 * which is what keeps events published before it existed valid.
 *
 * `inflection_table` (plan 69) is the second template that can: the author picks typing or a
 * bank of forms, and the two are «high/medium» and «medium/low» evidence in the handoff's own
 * words. Its bank is never consumed — a form may be placed in more than one cell (§3.6) — and
 * its size needs the key column, because the bank is the keys plus the distractors.
 */
function describeAnswerForm(
  templateCode: string,
  content: unknown,
  expectedAnswers: unknown,
): AnswerForm | undefined {
  if (templateCode === INFLECTION_TABLE) {
    const table = itFromPersisted(content, expectedAnswers);
    const typed = table.input.mode !== 'bank';
    return {
      mode: typed ? 'free' : 'bank',
      bankSize: typed ? null : itBankForms(table).length,
      wordsConsumed: false,
    };
  }
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
  // `inflection_table` reads the same: a cell is the item, keyed `rowId:slotId` (plan 69 §3.9).
  // The row verdict stays in the details — a second entry per row would turn one wrong cell
  // into two review cards.
  // `information_transfer` the same, a field for a cell, keyed by its id (plan 73 §3.9).
  if (
    templateCode === SORT_INTO_BUCKETS ||
    templateCode === INFLECTION_TABLE ||
    templateCode === INFORMATION_TRANSFER
  ) {
    return sortItemResults(details);
  }
  // Item by item (plans 67 and 68): a question or a segment is the item, keyed by its id as
  // the kernel's `itemsOf` spells it for addressing, with its *first* check's verdict.
  if (isItemByItem(templateCode)) return firstVerdictsIn(templateCode, details);
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
 * Whether this delivery handed part of the answer over — plan 66, decision Q2-B.
 *
 * Read off the server's document, never off the client: a runner claiming it hid the
 * counter would be claiming stronger evidence for itself. Two cases, both
 * `sort_into_buckets`, both named in the handoff: the «N igjen» counter turns the last items
 * into arithmetic (DECISIONS §4), and a board with most items in one bucket is passed by
 * dumping. Both are the kernel's `ceilingCause` — the very rule the builder warns with
 * (`SB_CEILING_LOWERED`), so an author is never told nothing stands in the way of an
 * exercise whose evidence is lowered here. The kernel's
 * `evidenceStrength` then drops the success ceiling one step for every consumer.
 */
function evidenceLowered(
  templateCode: string,
  content: unknown,
  expectedAnswers: unknown,
  checkMode: string,
): boolean {
  // `inflection_table` (plan 69, Q3-A): the key's first letter in an empty cell. A graded
  // delivery never shows it (`withGradedSettings`), so only a practice one is lowered.
  if (templateCode === INFLECTION_TABLE) {
    return (
      checkMode !== 'GRADED' && itCeilingCause(itFromPersisted(content, expectedAnswers)) !== null
    );
  }
  // `highlight_in_text` (plan 67 §3.6) by the same road: «Det er N å finne» turns the tail
  // into counting, and with no penalty for an extra mark, marking everything passes. Its
  // kernel's `ceilingCause` is the rule the builder warns with (`HT_COUNT_SHOWN`,
  // `HT_PENALTY_OFF`).
  if (templateCode === HIGHLIGHT_IN_TEXT) {
    return htCeilingCause(htFromPersisted(content, expectedAnswers)) !== null;
  }
  // `dictation` (plan 68 §3.7): a word counter above the field gives the length of the
  // answer away, and a transcript shown other than after the check gives the answer itself.
  // Same rule as the builder's evidence-ceiling line in step 4.
  if (templateCode === DICTATION) {
    return dcCeilingCause(dcFromPersisted(content, expectedAnswers)) !== null;
  }
  if (templateCode !== SORT_INTO_BUCKETS) return false;
  return sbCeilingCause(sbFromPersisted(content, expectedAnswers)) !== null;
}

/**
 * The per-item verdicts of a `sort_into_buckets` board, keyed by item id (plan 66, Q3-A) — and
 * of an `inflection_table`, whose items are its cells.
 *
 * Carried in `gapResults` because that is the one road per-item evidence has to the
 * scheduler: each verdict is joined to the addresses of its item, so review can bring back
 * the tiles that were misfiled rather than the whole board (AC-X5). The key is the item id,
 * exactly as `itemsOf` in the kernel spells it for addressing.
 *
 * The verdict is the *first* check's — the only one an event is published for, and the one
 * the score counts. Read off `firstCorrect` rather than `correct` so that the meaning holds
 * even if a later check were ever to publish.
 */
function sortItemResults(details: unknown): Array<{ gapKey: string; correct: boolean }> | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const { items } = details as { items?: unknown };
  if (!Array.isArray(items)) return undefined;

  return items.flatMap((raw) => {
    const { itemId, firstCorrect } = (raw ?? {}) as { itemId?: unknown; firstCorrect?: unknown };
    return typeof itemId === 'string' ? [{ gapKey: itemId, correct: firstCorrect === true }] : [];
  });
}

function asAttemptRefusal(error: ValidationError): ValidationError | InvalidAttemptTransitionError {
  return ATTEMPT_STATE_REFUSALS.has(error.code)
    ? new InvalidAttemptTransitionError(error.message)
    : error;
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
 * `writing_task` and `read_aloud`: the two templates a person grades out of criteria
 * rather than out of items (plan 50 §3.2, plan 70 §3.6). Every other template routes with
 * `null` and is scored exactly as before. A `read_aloud` snapshot also carries who may see
 * each criterion and the mode — the verdict reads the mode to decide how strong the
 * evidence is (Q6-A), and a mode switched after the work was handed in must not restate it.
 *
 * Assembled from both columns because the level descriptors live in `expected_answers`
 * (the kernel's persistence.ts) and the queue draws them beside each mark. A malformed
 * exercise costs the snapshot, not the submission: the student's text is already
 * written, and refusing it here to report the author's bug would throw the work away.
 */
function rubricFor(templateCode: string, content: unknown, expectedAnswers: unknown): RubricSnapshot | null {
  if (templateCode === READ_ALOUD) {
    const document = raFromPersisted(content, expectedAnswers);
    return document.rubric.length === 0 ? null : raSnapshotOf(document);
  }
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
    // The time a `dictation` check is throttled against (plan 68, Q4-A) — the server's, or for
    // a call replayed from the phone's offline journal the phone's as `stampReplayedCall`
    // bounds it: a replay arrives in a burst, and the server's clock would refuse the second
    // check of a segment the student made minutes after the first. Optional so the module
    // needs no binding for the system clock.
    @Optional() @Inject(CLOCK) private readonly clock: IClock = new SystemClock(),
    // Asked only by a `read_aloud` submit (plan 70 §3.5). Optional so that a module — or a
    // test — with no binding still runs every other template; a recording submitted there is
    // answered as if media-service were away, which is the truth of it.
    @Optional() @Inject(MEDIA_ASSETS) private readonly media: IMediaAssets | null = null,
    // Who reads work with no school (plan 79, step 2.1c). Optional for the same reason; with
    // no binding every such submission routes for review, as it did before the step.
    @Optional() @Inject(ReviewerResolver) private readonly reviewers: ReviewerResolver | null = null,
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
    const now = stampReplayedCall(attempt, command.clientTime, this.clock.now());

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
      if (closesTable(attempt)) {
        return Result.fail(
          new InvalidAttemptTransitionError('This table is closed and cannot be checked again'),
        );
      }

      const reopened = attempt.reopenForRecheck(
        recheckBudget(attempt.templateCode, def.exercise.content),
      );
      if (reopened.isFail) {
        return Result.fail(reopened.error as AttemptDomainError);
      }
    }

    // A `read_aloud` hands in files, not text, and whether they exist, are this student's,
    // were made for this attempt and are long enough is media-service's to say (plan 70
    // §3.5, RA-U9). Asked here, before the submission is written onto the attempt, because
    // the per-type validator is synchronous — and because a refusal returned now leaves the
    // attempt exactly as it was: nothing below has been saved, so the draft and its takes
    // survive both a refusal and media-service being away (RA-U10).
    //
    // What is written is not quite what was sent: on a try after a return, the prompts the
    // teacher passed are carried in by the server (phase 11b), and only the rest is the
    // student's to have recorded.
    let answer = command.submittedAnswer;
    if (attempt.templateCode === READ_ALOUD) {
      const recordings = await this.acceptRecordings(
        attempt,
        command.submittedAnswer,
        def.exercise.content,
        def.exercise.expectedAnswers,
      );
      if (!('recordings' in recordings)) return Result.fail(recordings);
      answer = recordings;
    }

    // After the reopen, deliberately: the facts written over the submission include
    // which check this is, and `recheckCount` is only current once it has happened.
    const submittedAnswer = withRecordedReveals(attempt, answer, now);

    const answerHash = createHash('sha256')
      .update(JSON.stringify(submittedAnswer))
      .digest('hex');

    const submitResult = attempt.submit(submittedAnswer, answerHash, now);
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
      return Result.fail(asAttemptRefusal(validationResult.error));
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

      const rubric = rubricFor(
        attempt.templateCode,
        def.exercise.content,
        def.exercise.expectedAnswers,
      );
      const reviewer = await this.reviewerOf(attempt, def.exercise, rubric);

      const routeResult =
        reviewer === 'none'
          ? attempt.closeWithoutReviewer(machineTally(outcome.details))
          : attempt.routeForReview(machineTally(outcome.details), rubric);
      if (routeResult.isFail) {
        return Result.fail(routeResult.error as AttemptDomainError);
      }

      await this.attempts.save(attempt);
      await this.publishEvents(attempt);

      return Result.ok<SubmitAnswerResult, SubmitAnswerError>({
        attemptId: attempt.id,
        correct: false,
        score: null,
        // Still true for `none`: the answer needed a person, and what the machine could
        // decide below is all the learner gets. `reviewer` says nobody is coming.
        requiresReview: true,
        reviewer,
        feedback: {
          summary:
            reviewer === 'none'
              ? 'Your answer has been saved. Nobody can check it: there is no teacher to review it and no AI review on your plan.'
              : 'Your answer has been submitted for review.',
        },
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
    const generated = feedbackResult.isOk
      ? feedbackResult.value
      : { summary: outcome.correct ? 'Correct!' : 'Incorrect. Please try again.' };
    const feedback = revealedFeedback(attempt.templateCode, outcome.details) ?? generated;

    // A question (plan 67, Q1-A) or a segment (plan 68 §3.4) is still open: the check is recorded and the attempt goes on
    // being worked on — not scored, so nothing is published, and a reload finds it open. It
    // is scored once, by the submit that closes the last question.
    if (outcome.inProgress === true) {
      const partial = attempt.recordPartialCheck(outcome.details);
      if (partial.isFail) {
        return Result.fail(partial.error as AttemptDomainError);
      }

      await this.attempts.save(attempt);

      return Result.ok<SubmitAnswerResult, SubmitAnswerError>({
        attemptId: attempt.id,
        correct: outcome.correct,
        score: outcome.score,
        requiresReview: false,
        feedback,
        details: learnerFacingDetails(attempt.templateCode, outcome.details),
      });
    }

    const answerForm = describeAnswerForm(
      attempt.templateCode,
      def.exercise.content,
      def.exercise.expectedAnswers,
    );
    const gapResults = describeGapResults(attempt.templateCode, outcome.details);
    const scoreResult = attempt.score(
      outcome.score,
      passed,
      outcome.details,
      feedback,
      answerForm,
      gapResults,
      evidenceLowered(
        attempt.templateCode,
        def.exercise.content,
        def.exercise.expectedAnswers,
        attempt.checkMode,
      ),
      now,
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
      details: await this.withPairClips(
        attempt.templateCode,
        learnerFacingDetails(attempt.templateCode, outcome.details),
        def.exercise.content,
        def.exercise.expectedAnswers,
      ),
      audioTranscript: audioTranscriptFor(
        def.exercise.content,
        transcriptOwed(attempt.templateCode, outcome.details),
      ),
    });
  }

  /**
   * «Hør paret» under each pair of a `minimal_pairs` result (plan 72 §3.7): a signed link per
   * word, in the pair's own order, beside the spellings. Made now and never stored. A clip that
   * cannot be signed is an empty string in its place, so the order still matches the words and
   * the runner disables the button rather than playing the wrong word. Every other template, and
   * media-service being away, leaves the details as they were.
   */
  private async withPairClips(
    templateCode: string,
    details: unknown,
    content: unknown,
    expectedAnswers: unknown,
  ): Promise<unknown> {
    if (templateCode !== MINIMAL_PAIRS || typeof details !== 'object' || details === null) {
      return details;
    }
    const summary = details as { pairs?: Array<{ pairId: string }> };
    if (!Array.isArray(summary.pairs)) return details;

    const document = mpFromPersisted(content, expectedAnswers);
    const assetsOf = new Map(
      document.pairs.map((p) => [p.id, mpFilledWords(p).map((w) => w.clip.assetId)]),
    );
    const links = await playbackOf(
      this.media,
      summary.pairs.flatMap((p) => assetsOf.get(p.pairId) ?? []),
    );
    return {
      ...summary,
      pairs: summary.pairs.map((p) => ({
        ...p,
        clips: (assetsOf.get(p.pairId) ?? []).map((id) => links.get(id)?.url ?? ''),
      })),
    };
  }

  /**
   * The recordings of a `read_aloud` as they are to be written onto the attempt, or why they
   * cannot be handed in.
   *
   * On a try after a return the prompts the teacher passed are carried (phase 11b): the
   * student's recordings for them, if a client sent any, are dropped, and the carried ones —
   * checked when they were handed in, and made for the attempt they were passed in — are put
   * back beside the new ones without asking media-service about them again.
   *
   * Cheapest first: a submission that does not name every prompt is refused without a call.
   */
  private async acceptRecordings(
    attempt: Attempt,
    submitted: unknown,
    content: unknown,
    expectedAnswers: unknown,
  ): Promise<RaSubmission | SubmitAnswerError> {
    const submission = readRecordings(submitted);
    if (submission instanceof ValidationError) return submission;

    const previous =
      attempt.previousAttemptId === null
        ? null
        : await this.attempts.findById(attempt.previousAttemptId);
    const carried = carriedInto(previous, content);
    const fresh = raFreshPart(submission, carried);

    const prompts = checkPrompts(
      fresh,
      content,
      expectedAnswers,
      new Set(carried.map((r) => r.itemId)),
    );
    if (prompts) return prompts;

    const whole = raWithCarried(
      fresh,
      carried,
      raFromPersisted(content, expectedAnswers).prompts.map((p) => p.id),
    );
    if (fresh.recordings.length === 0) return whole;

    if (this.media === null) return { code: 'MEDIA_UNAVAILABLE' };
    const described = await this.media.describe(assetIdsOf(fresh));
    // Any failure, not only a timeout: the engine cannot tell "your recording is not there"
    // from "media-service is not answering properly", and only the second is never the
    // student's fault. A 4xx here would be the engine's own malformed request.
    if (described.isFail) return { code: 'MEDIA_UNAVAILABLE' };

    const refused = checkAssets(fresh, content, expectedAnswers, described.value, {
      id: attempt.id,
      userId: attempt.userId,
    });
    return refused ?? whole;
  }

  /** `ai` with no resolver bound: routing is what the handler did before step 2.1c. */
  private async reviewerOf(
    attempt: Attempt,
    exercise: { content: unknown; expectedAnswers: unknown },
    rubricSnapshot: RubricSnapshot | null,
  ): Promise<Reviewer> {
    if (attempt.schoolId !== null) return 'teacher';
    if (this.reviewers === null) return 'ai';
    return this.reviewers.resolve({
      userId: attempt.userId,
      schoolId: attempt.schoolId,
      templateCode: attempt.templateCode,
      targetLanguage: attempt.targetLanguage,
      submittedAnswer: attempt.submittedAnswer,
      rubricSnapshot,
      exercise,
    });
  }

  private async publishEvents(attempt: import('../../../domain/entities/attempt.entity.js').Attempt): Promise<void> {
    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();
  }
}
