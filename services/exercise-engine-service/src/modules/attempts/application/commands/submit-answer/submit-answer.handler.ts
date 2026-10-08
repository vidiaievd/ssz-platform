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
  ceilingCause as sbCeilingCause,
  fromPersisted as sbFromPersisted,
  maxChecks as sbMaxChecks,
  readContent as sbReadContent,
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
  maxChecks as itMaxChecks,
  readContent as itReadContent,
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
import { playbackOf, probeStatesOf } from '../../services/minimal-pairs-sitting.js';
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
import { audioTranscriptFor, type AudioTranscript } from '../../services/audio-transcript.js';
import { firstVerdictsIn, isItemByItem, withRecordedItems } from '../../services/item-states.js';
import { CLOCK, SystemClock, type IClock } from '../../../../../shared/application/ports/clock.port.js';
import { MEDIA_ASSETS, type IMediaAssets } from '../../../../../shared/application/ports/media-assets.port.js';
import {
  assetIdsOf,
  carriedInto,
  checkAssets,
  checkPrompts,
  readRecordings,
} from '../../services/read-aloud-recordings.js';

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
  // `sort_into_buckets` travels whole for the same reason (plan 66): the kernel's `check`
  // already decided how much of the key a check may carry — which tiles are wrong and why
  // on every pass, the right bucket, each item's `why` and each bucket's rule only once the
  // board is closed under `revealKey`. The explanation for a wrong bucket is resolved there
  // too; the feedback map itself never leaves the server.
  if (templateCode === SORT_INTO_BUCKETS) return details;
  // `highlight_in_text` travels whole for the same reason (plan 67 §3.5): the kernel's `check`
  // decided how much of the key an answer carries — the student's own marks with a state
  // each, the key boundary on a near miss, a *count* of missed spans and never where they
  // are (AC-S5), the hints only under `settings.hints` and only for the failure that
  // happened. The spans with their reasons come back only on a reveal of that question.
  if (templateCode === HIGHLIGHT_IN_TEXT) return details;
  // `dictation` the same way (plan 68 §3.5): the corrected line of this check, the focus
  // words that came back wrong with their reasons, the segment's reason only after a failed
  // check under `hints`, the sentence only on a reveal and a transcript slice only for a
  // closed segment — all decided in the kernel's `check`. The segment states it carries hold
  // nothing a check has not already shown: the first check's line was that check's verdict.
  if (templateCode === DICTATION) return details;
  // `inflection_table` the same way (plan 69 §3.5): every cell's verdict, its near miss and
  // the author's reason for a wrong one on every check — DECISIONS §3 wants the student told
  // it was the definite, not that they were close — and the correct form only under
  // `revealKey`, all decided in the kernel's `check`. The rows are counts; the first answers
  // are the student's own.
  if (templateCode === INFLECTION_TABLE) return details;
  if (templateCode === MINIMAL_PAIRS) return minimalPairsSummary(details);
  return undefined;
}

/**
 * The result of a `minimal_pairs` sitting as the student sees it (plan 72 §3.7): the tally, the
 * verdict against the author's pass mark, and one line per pair that came up. An allowlist, for
 * the reason `shortAnswerVerdicts` gives: the details also hold every probe's record — which
 * word was played where, and the provenance of each clip — and those are the teacher's.
 *
 * Every word was shown to the student by then (each probe's reveal spells its buttons), so the
 * spellings of a pair are not news. The links to «Hør paret» are added by the handler, which can
 * ask media-service; this function cannot.
 */
function minimalPairsSummary(details: unknown): unknown {
  if (typeof details !== 'object' || details === null) return undefined;
  const { right, total, score, passed, passPct, pairs } = details as {
    right?: unknown;
    total?: unknown;
    score?: unknown;
    passed?: unknown;
    passPct?: unknown;
    pairs?: unknown;
  };
  return {
    right,
    total,
    score,
    passed,
    passPct,
    pairs: Array.isArray(pairs)
      ? pairs.map((pair) => {
          const { pairId, words, played, correct } = pair as {
            pairId: string;
            words: string[];
            played: number;
            correct: number;
          };
          return { pairId, words, played, correct };
        })
      : [],
  };
}

/**
 * The templates checked as one board, with a budget of checks and a frozen set carried from
 * one check to the next in the attempt's own details (plan 54 §3.3). `sort_into_buckets`
 * joined with plan 66: the mechanics are the same, and so are the field names its validator
 * writes — `closed`, `locked`, `items[].itemId`, `items[].firstAnswer` — so the helpers
 * below read both without knowing which they hold. `inflection_table` joined with plan 69 on
 * the same terms, a cell for an item.
 */
const WHOLE_BOARD_CHECKS: ReadonlySet<string> = new Set([
  MULTIPLE_CHOICE_GROUP,
  SORT_INTO_BUCKETS,
  INFLECTION_TABLE,
]);

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
function withRecordedReveals(attempt: Attempt, submitted: unknown, now: Date): unknown {
  if (attempt.templateCode === MULTIPLE_CHOICE) return withRecordedPicks(attempt, submitted);
  if (attempt.templateCode === MINIMAL_PAIRS) return recordedSitting(attempt);
  if (WHOLE_BOARD_CHECKS.has(attempt.templateCode)) return withRecordedChecks(attempt, submitted);
  if (isItemByItem(attempt.templateCode)) return withRecordedItems(attempt, submitted, now);
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
 * A `minimal_pairs` sitting as the attempt recorded it — the draw made at the start and every
 * answer `/answers` judged — with nothing taken from the body (plan 72 §3.6). The same reasoning
 * as `withRecordedPicks`, one step further: here even the questions are the server's, since the
 * client never learns which word a probe was. A probe never answered is simply absent from
 * `states`, and the kernel counts it wrong.
 */
function recordedSitting(attempt: Attempt): unknown {
  return { draw: attempt.probeDraw ?? [], states: probeStatesOf(attempt) };
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
  if (templateCode === SORT_INTO_BUCKETS || templateCode === INFLECTION_TABLE) {
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

/**
 * The line a closed-by-reveal item carries — a `highlight_in_text` question (plan 67,
 * phase 9) or a `dictation` segment.
 *
 * The generator knows only right and wrong, and a revealed question is neither: nothing was
 * checked, the key was shown. Left alone it said «Incorrect. Please try again.» about a
 * question that has no further attempt to make.
 */
function revealedFeedback(
  templateCode: string,
  details: unknown,
): { summary: string } | null {
  if (!isItemByItem(templateCode)) return null;
  if (typeof details !== 'object' || details === null) return null;
  return (details as { revealed?: unknown }).revealed === true
    ? { summary: 'The answer has been shown.' }
    : null;
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
    // `inflection_table` grades a graded delivery under its own rules — the first check
    // closes the table and the key stays back (Q8-A of plan 67) — and the mode is the
    // attempt's, never the client's. The other two have no such rule and are left as sent.
    ...(attempt.templateCode === INFLECTION_TABLE
      ? { graded: attempt.checkMode === 'GRADED' }
      : {}),
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
  if (templateCode === MULTIPLE_CHOICE_GROUP) return mcgMaxAttempts(mcgReadContent(content).settings);
  // `settings.attempts`: 1, 2 or 3 checks of the board, or 0 for unlimited (plan 66).
  if (templateCode === SORT_INTO_BUCKETS) return sbMaxChecks(sbReadContent(content).settings) ?? undefined;
  // `settings.attempts`: 1–4 checks of the table, never unlimited (plan 69 §3.4).
  if (templateCode === INFLECTION_TABLE) return itMaxChecks(itReadContent(content).settings);
  // `minimal_pairs` is checked once (plan 72 §3.7). Its probes were answered one by one and the
  // submit only sums them; a reopened sitting would let the open probes be answered after the
  // result was shown. «Ny runde» is a new attempt with a new draw.
  if (templateCode === MINIMAL_PAIRS) return 1;
  // `highlight_in_text` has a budget too, but per question rather than per attempt (plan 67,
  // Q1-A), and the kernel spends it. The attempt is not reopened between questions at all —
  // it stays in progress until the last one closes; a reopen comes only after that, for
  // «Vis fasit» on a question that ran out of checks. `dictation` the same, per segment.
  return undefined;
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
  if (!WHOLE_BOARD_CHECKS.has(attempt.templateCode)) return null;
  if (!previousCheck(attempt).closed) return null;
  return new InvalidAttemptTransitionError('This table is closed and cannot be checked again');
}

/**
 * A grader's refusal that is really about the attempt's state, as the refusal of a state
 * transition.
 *
 * `highlight_in_text` decides in its kernel whether a question may still be submitted — a
 * passed or revealed one never, one out of checks only for «Vis fasit», the key only after
 * a check and only under `revealKey` (AC-S9, SPEC_api_contract §4). The kernel is the one
 * place that knows, so the handler does not second-guess it ahead of time the way
 * `refuseClosedTable` does for a whole board; it relabels the verdict instead, so the caller
 * sees the same refusal a closed table gets. A mark that covers no word stays a validation
 * error: that one is about the answer.
 */
const ATTEMPT_STATE_REFUSALS: ReadonlySet<string> = new Set([
  'HT_QUESTION_CLOSED',
  'HT_REVEAL_NOT_ALLOWED',
  // `dictation` the same, per segment (AC-R9).
  'DICT_SEGMENT_CLOSED',
  'DICT_REVEAL_NOT_ALLOWED',
]);

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
    // The time a `dictation` check is throttled against (plan 68, Q4-A) — the server's,
    // never the client's. Optional so the module needs no binding for the system clock.
    @Optional() @Inject(CLOCK) private readonly clock: IClock = new SystemClock(),
    // Asked only by a `read_aloud` submit (plan 70 §3.5). Optional so that a module — or a
    // test — with no binding still runs every other template; a recording submitted there is
    // answered as if media-service were away, which is the truth of it.
    @Optional() @Inject(MEDIA_ASSETS) private readonly media: IMediaAssets | null = null,
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
    const submittedAnswer = withRecordedReveals(attempt, answer, this.clock.now());

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
      audioTranscript: audioTranscriptFor(def.exercise.content, true),
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

  private async publishEvents(attempt: import('../../../domain/entities/attempt.entity.js').Attempt): Promise<void> {
    for (const event of attempt.getDomainEvents()) {
      await this.publisher.publish(event.eventType, event.payload);
    }
    attempt.clearDomainEvents();
  }
}
