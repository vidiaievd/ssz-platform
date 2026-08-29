// Grading for `multiple_choice_group`: the whole table at once, and what a check leaves
// behind.
//
// The unit of work is the group, so unlike `multiple_choice` there is no per-question
// judge here — there is one `check`, and its result decides three things at the same time:
// the score, whether the table is closed, and which rows the student may still edit.
//
// The key does not reach the browser (plan 54 §3.2), so this runs on the server and hands
// back only what the student is allowed to know at that moment. That "at that moment" is
// the substance:
//
//   * which rows are wrong comes back on every check — it is the point of checking;
//   * **which column was right comes back only once the table closes** — right, revealed,
//     or out of attempts. Sending the key with a wrong row that still has a retry left
//     would make the retry theatre (README, "showKey = closed && settings.revealKey");
//   * the per-row explanation follows `showWhy`, and a row with neither `why` nor `quote`
//     renders no block at all even under `always` (IMPLEMENTATION.md test checklist).
//
// ── On what "score" means here ──────────────────────────────────────────────
// BEHAVIOR §7 is explicit and differs from `multiple_choice`: the score reflects the
// **current** answers, not the first pass. A student who fixes their mistakes under
// `retry: 'one'` scores 100%, and the attempt count is what distinguishes them.
//
// That is safe to follow only because the platform already separates the two questions.
// `Attempt.score()` publishes `AttemptScoredEvent` when `recheckCount === 0` alone, so the
// SRS sees the first check and nothing else, whatever a later re-check does to the number
// on screen (plan 54 §3.3). Were that not so, this contract would hand the SRS a corrected
// table as evidence that the text was understood.

import { column, readyRows } from './derive.js';
import type { MultipleChoiceGroupContent, Settings } from './model.js';
import { maxAttempts } from './model.js';

/** rowId → picked column id. A missing key is an unanswered row. */
export type Answers = Readonly<Record<string, string>>;

export interface CheckInput {
  ex: MultipleChoiceGroupContent;
  answers: Answers;
  /** 1-based: which check of the table this is. */
  attempt: number;
  /** The student pressed «Vis fasit» instead of retrying — the table closes. */
  reveal?: boolean;
  /** Rows frozen by an earlier check under `lockCorrect`; they stay frozen. */
  locked?: readonly string[];
}

export interface RowOutcome {
  rowId: string;
  /** `null` when the row was left unanswered. */
  answer: string | null;
  correct: boolean;
  /** The right column. Present only once the table is closed *and* `revealKey` is on. */
  keyColumnId?: string;
  /** The author's line. Present under `showWhy`, and only when there is one to show. */
  why?: string;
  /** The line of the passage that proves it — shown with `why`, never before. */
  quote?: string;
}

export interface CheckResult {
  rows: RowOutcome[];
  /** Rows answered correctly. */
  correct: number;
  /** Ready rows. Rows dropped by `readyRows` never appear in the total. */
  total: number;
  /** 0-100, rounded. The platform's contract, read by SRS: below 60 is `AGAIN`. */
  pct: number;
  passed: boolean;
  attempt: number;
  attemptsLeft: number;
  /** No further check is possible: all right, revealed, or the budget is spent. */
  closed: boolean;
  /** The cumulative frozen set after this check, under `lockCorrect`. */
  locked: string[];
}

/**
 * Check the whole table.
 *
 * Runs over the server's own document, never over what the client claims: the answers are
 * read from the payload, everything else — the key, the settings, which rows are even
 * shown — comes from `ex`.
 */
export function check(input: CheckInput): CheckResult {
  const { ex, answers, attempt } = input;
  const s = ex.settings;
  const ready = readyRows(ex);
  const already = input.locked ?? [];

  const graded = ready.map((row) => {
    const picked = answers[row.id] ?? null;
    return { row, picked, correct: picked !== null && picked === row.answer };
  });

  const correct = graded.filter((g) => g.correct).length;
  const total = graded.length;
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);

  const attemptsLeft = Math.max(0, maxAttempts(s) - attempt);
  const closed = correct === total || input.reveal === true || attemptsLeft === 0;
  const showKey = closed && s.revealKey;

  const rows = graded.map(({ row, picked, correct: ok }): RowOutcome => {
    const outcome: RowOutcome = { rowId: row.id, answer: picked, correct: ok };

    if (showKey && column(ex, row.answer) !== null) outcome.keyColumnId = row.answer!;

    if (explains(s, ok)) {
      if (row.why.trim() !== '') outcome.why = row.why.trim();
      if (row.quote.trim() !== '') outcome.quote = row.quote.trim();
    }

    return outcome;
  });

  const locked = s.lockCorrect
    ? [...new Set([...already, ...graded.filter((g) => g.correct).map((g) => g.row.id)])]
    : [...already];

  return { rows, correct, total, pct, passed: pct >= s.passThreshold, attempt, attemptsLeft, closed, locked };
}

/**
 * The answers a student carries into the next attempt — BEHAVIOR R15.
 *
 * The wrong ones are cleared so the row is genuinely re-answered; the correct ones are kept
 * only when `lockCorrect` is on, because with it off the whole table is editable again and
 * keeping a pick the student may want to change would be an odd half-measure.
 *
 * Server-side rather than the runner's, for the reason the lock itself is: a client that
 * decided what survives a retry could keep a wrong answer and call it locked.
 */
export function carryOver(ex: MultipleChoiceGroupContent, answers: Answers): Answers {
  if (!ex.settings.lockCorrect) return {};

  const kept: Record<string, string> = {};
  for (const row of readyRows(ex)) {
    const picked = answers[row.id];
    if (picked !== undefined && picked === row.answer) kept[row.id] = picked;
  }
  return kept;
}

/** Whether every ready row has been answered — what enables «Sjekk svarene» (R4/R5). */
export function allAnswered(ex: MultipleChoiceGroupContent, answers: Answers): boolean {
  const ready = readyRows(ex);
  return ready.length > 0 && ready.every((row) => (answers[row.id] ?? '') !== '');
}

/** How many ready rows are still unanswered — the «N igjen» counter. */
export function remaining(ex: MultipleChoiceGroupContent, answers: Answers): number {
  return readyRows(ex).filter((row) => (answers[row.id] ?? '') === '').length;
}

function explains(s: Settings, correct: boolean): boolean {
  if (s.showWhy === 'always') return true;
  if (s.showWhy === 'wrong') return !correct;
  return false;
}
