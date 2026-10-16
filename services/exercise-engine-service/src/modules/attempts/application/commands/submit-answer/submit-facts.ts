import { TEMPLATE_CODE as WORD_BANK_GAP_FILL } from '@ssz/shared-kernel/wordbank-gapfill';
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
  maxChecks as sbMaxChecks,
  readContent as sbReadContent,
  TEMPLATE_CODE as SORT_INTO_BUCKETS,
} from '@ssz/shared-kernel/sort-into-buckets';
import { TEMPLATE_CODE as HIGHLIGHT_IN_TEXT } from '@ssz/shared-kernel/highlight-in-text';
import { TEMPLATE_CODE as DICTATION } from '@ssz/shared-kernel/dictation';
import {
  maxChecks as itMaxChecks,
  readContent as itReadContent,
  TEMPLATE_CODE as INFLECTION_TABLE,
} from '@ssz/shared-kernel/inflection-table';
import { TEMPLATE_CODE as MINIMAL_PAIRS } from '@ssz/shared-kernel/minimal-pairs';
import {
  maxChecks as infMaxChecks,
  readContent as infReadContent,
  TEMPLATE_CODE as INFORMATION_TRANSFER,
} from '@ssz/shared-kernel/information-transfer';
import {
  informationTransferClosed,
  informationTransferLearnerDetails,
} from '../../services/information-transfer-details.js';
import { isItemByItem, withRecordedItems } from '../../services/item-states.js';
import { probeStatesOf } from '../../services/minimal-pairs-attempt.js';

/**
 * The pure part of handing an answer in: what the attempt knows written over what the client
 * sent, how many checks it may still have, and how much of a verdict the learner may see.
 *
 * Lifted out of `submit-answer.handler.ts` unchanged, so that it reads an attempt through
 * `AttemptFacts` rather than the entity: VoxOrd grades an attempt offline and copies this file
 * (`scripts/sync-engine-port.mjs`) so that it decides exactly what the engine decides.
 */

/** The fields of an attempt these functions read; the `Attempt` entity has them all. */
export interface AttemptFacts {
  templateCode: string;
  checkMode: string;
  validationDetails: unknown;
  recheckCount: number;
  probeDraw: unknown;
  checkedRows: ReadonlyArray<{ rowId: string; revealed: boolean }>;
  pickedOptions: ReadonlyArray<{
    questionId: string;
    picks: readonly string[];
    closed: boolean;
    revealed: boolean;
  }>;
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
export function learnerFacingDetails(templateCode: string, details: unknown): unknown {
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
  // `information_transfer` (plan 73 §3.6): the kernel's `check` decided how much of the key a
  // check carries — the verdict of every cell, the reason for a cell not counted, the standard
  // form beside a right one, the key only under `revealKey`, the hints only under
  // `hintsAfter: 1`. An allowlist on top, because the details are also the report's record.
  if (templateCode === INFORMATION_TRANSFER) return informationTransferLearnerDetails(details);
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
  const { right, total, score, passed, passPct, memory, pairs } = details as {
    right?: unknown;
    total?: unknown;
    score?: unknown;
    passed?: unknown;
    passPct?: unknown;
    memory?: unknown;
    pairs?: unknown;
  };
  return {
    right,
    total,
    score,
    passed,
    passPct,
    // What the result moves — the closing line of the summary is worded by it (plan 72 §4.2,
    // point 6). Absent from attempts scored before it was recorded.
    ...(typeof memory === 'string' ? { memory } : {}),
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
 * the same terms, a cell for an item, and `information_transfer` with plan 73, a field for one.
 */
export const WHOLE_BOARD_CHECKS: ReadonlySet<string> = new Set([
  MULTIPLE_CHOICE_GROUP,
  SORT_INTO_BUCKETS,
  INFLECTION_TABLE,
  INFORMATION_TRANSFER,
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
export function withRecordedReveals(attempt: AttemptFacts, submitted: unknown, now: Date): unknown {
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
function withRecordedPicks(attempt: AttemptFacts, submitted: unknown): unknown {
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
function recordedSitting(attempt: AttemptFacts): unknown {
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
export function shortAnswerVerdicts(details: unknown): unknown {
  if (typeof details !== 'object' || details === null) return undefined;

  const { items, totalItems, passedItems, routedItems } = details as {
    items?: unknown;
    totalItems?: unknown;
    passedItems?: unknown;
    routedItems?: unknown;
  };
  if (!Array.isArray(items)) return undefined;

  const verdictOf = (item: unknown): unknown => (item as { verdict?: unknown }).verdict;
  const skippedOf = (item: unknown): boolean => (item as { skipped?: unknown }).skipped === true;

  return {
    totalItems,
    passedItems,
    routedItems,
    verdicts: {
      pass: items.filter((item) => verdictOf(item) === 'pass').length,
      partial: items.filter((item) => verdictOf(item) === 'partial').length,
      // A skipped question is graded as a fail, and counted on its own here rather than
      // twice: «not approved» is what an answer earned, «no answer» is what was left.
      fail: items.filter((item) => verdictOf(item) === 'fail' && !skippedOf(item)).length,
      skipped: items.filter(skippedOf).length,
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
      return { itemId, verdict, covered, total, tooShort, routing, skipped: skippedOf(item) };
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
export function translateRouting(details: unknown): unknown {
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
 * The line a closed-by-reveal item carries — a `highlight_in_text` question (plan 67,
 * phase 9) or a `dictation` segment.
 *
 * The generator knows only right and wrong, and a revealed question is neither: nothing was
 * checked, the key was shown. Left alone it said «Incorrect. Please try again.» about a
 * question that has no further attempt to make.
 */
export function revealedFeedback(
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

export function previousCheck(attempt: AttemptFacts): PreviousCheck {
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
    locked: Array.isArray(locked)
      ? locked.filter((id): id is string => typeof id === 'string')
      : [],
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
function withRecordedChecks(attempt: AttemptFacts, submitted: unknown): unknown {
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
    // attempt's, never the client's. `information_transfer` the same (plan 73 §3.7). The
    // other two have no such rule and are left as sent.
    ...(attempt.templateCode === INFLECTION_TABLE || attempt.templateCode === INFORMATION_TRANSFER
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
export function recheckBudget(templateCode: string, content: unknown): number | undefined {
  if (templateCode === MULTIPLE_CHOICE_GROUP)
    return mcgMaxAttempts(mcgReadContent(content).settings);
  // `settings.attempts`: 1, 2 or 3 checks of the board, or 0 for unlimited (plan 66).
  if (templateCode === SORT_INTO_BUCKETS)
    return sbMaxChecks(sbReadContent(content).settings) ?? undefined;
  // `settings.attempts`: 1–4 checks of the table, never unlimited (plan 69 §3.4).
  if (templateCode === INFLECTION_TABLE) return itMaxChecks(itReadContent(content).settings);
  // `answering.attempts`: 1, 2 or 3 checks of the blank, or 0 for unlimited (plan 73 §3.1).
  if (templateCode === INFORMATION_TRANSFER) {
    return infMaxChecks(infReadContent(content).answering) ?? undefined;
  }
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
 * Whether a scored check has finished the exercise as far as the transcript is concerned.
 *
 * Every template but one: scored is finished. `information_transfer` is scored by its first
 * check and stays open for the corrections (plan 73 §3.6), and the one clip holds the answer to
 * every cell still wrong — so the transcript waits for the blank to close (deviation 16, the
 * precedent of plan 68 §3.6). A graded blank closes on its one check.
 */
export function transcriptOwed(templateCode: string, details: unknown): boolean {
  if (templateCode === INFORMATION_TRANSFER) return informationTransferClosed(details);
  return true;
}

/**
 * The refusal that the budget cannot express: a table the last check *closed*.
 *
 * A table closes for three reasons and only one of them is the budget running out. The
 * other two — every row right, and «Vis fasit» — leave checks unspent, and without this a
 * student who revealed the key could then spend them on the answers they had just been
 * shown.
 */
export function closesTable(attempt: AttemptFacts): boolean {
  if (!WHOLE_BOARD_CHECKS.has(attempt.templateCode)) return false;
  return previousCheck(attempt).closed;
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
export const ATTEMPT_STATE_REFUSALS: ReadonlySet<string> = new Set([
  'HT_QUESTION_CLOSED',
  'HT_REVEAL_NOT_ALLOWED',
  // `dictation` the same, per segment (AC-R9).
  'DICT_SEGMENT_CLOSED',
  'DICT_REVEAL_NOT_ALLOWED',
]);
