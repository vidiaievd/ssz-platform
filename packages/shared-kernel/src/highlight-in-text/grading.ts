// Grading for `highlight_in_text`: one question at a time, and what a check leaves behind.
//
// ── One check ───────────────────────────────────────────────────────────────
// SPEC_data_model §6, DECISIONS §4:
//
//   exact  = key spans with an identical student mark   (one student mark per key span)
//   near   = key spans with an overlapping, non-identical student mark
//   miss   = key spans with nothing over them
//   fp     = student marks consumed by neither
//   score  = max(0, (|exact| − w·|fp|) / |key spans|),  w = off 0 · half 0.5 · full 1
//   passed = score ≥ threshold / 100
//
// Exact matches are taken over the whole key before any near match (plan 67 §4.2, 6). The
// prototype does it span by span in one pass; on a valid key — spans never overlap, that is a
// blocker — the two agree, but the two-pass order does not depend on that being enforced.
//
// ── The attempt, question by question ───────────────────────────────────────
// Decision Q1-A of plan 67. One attempt holds every question; each submit is about one of
// them. The server carries every question's state from submit to submit (`questions`) — the
// way plan 54 carries `firstAnswer` — and this function decides from it:
//
//   * the budget is **per question** (`settings.attempts`, 0 = unlimited); a reveal is not a
//     check and spends nothing;
//   * a question closes when it passes, is revealed, or runs out of checks. A passed or
//     revealed question refuses every further submit (AC-S9); one out of checks still allows
//     «Vis fasit» — the prototype offers it there, and the key is what that student needs;
//   * what is recorded is the **first** check of each question (DECISIONS §6). The attempt's
//     score is their mean over the ready questions, and the attempt is complete when every
//     ready question is closed — `completedNow` marks the one submit on which that happened,
//     which is when the engine sends the evidence.
//
// ── How much of the key a check returns ─────────────────────────────────────
// SPEC_api_contract §3–4: the student's own marks with a state each; a `near` mark carries
// the key's boundary, because showing where the phrase ends is the whole point of that state;
// a *count* of missed spans, never their positions (AC-S5); `missHint`/`fpHint` only after a
// failed check, only under `settings.hints`, only for the failure that happened. The key with
// its explanations comes back only on reveal.

import type { CharRange, TokenRun } from './coordinates.js';
import { snapMarks, toCharRange } from './coordinates.js';
import type { SpanRun } from './derive.js';
import { readyQuestions, spanRuns } from './derive.js';
import type { HighlightInTextContent, Penalty } from './model.js';
import { maxChecks, PENALTY_WEIGHT } from './model.js';
import type { Token } from './tokenize.js';
import { tokenize } from './tokenize.js';

// ── one check ───────────────────────────────────────────────────────────────

export type CellState = 'exact' | 'near' | 'fp';

/** One of the student's marks after a check — SPEC_api_contract §3 `cells`. */
export interface Cell {
  start: number;
  end: number;
  state: CellState;
  /** The key span a `near` mark overlaps — where the answer really begins and ends. */
  keyStart?: number;
  keyEnd?: number;
}

export interface GradeResult {
  exact: number;
  near: number;
  miss: number;
  fp: number;
  /** Key spans. */
  total: number;
  /** 0..1, after the penalty. */
  score: number;
  /** In text order. */
  cells: Cell[];
}

/** Grade one set of marks (token runs, already snapped and merged) against one key. */
export function grade(
  tokens: readonly Token[],
  key: readonly SpanRun[],
  marks: readonly TokenRun[],
  penalty: Penalty,
): GradeResult {
  const used = new Set<number>();
  const exactKeys = new Set<number>();
  const cells: Cell[] = [];

  key.forEach((k, ki) => {
    const mi = marks.findIndex((m, i) => !used.has(i) && m.t0 === k.t0 && m.t1 === k.t1);
    if (mi === -1) return;
    used.add(mi);
    exactKeys.add(ki);
    cells.push({ ...toCharRange(tokens, marks[mi] as TokenRun), state: 'exact' });
  });

  let near = 0;
  let miss = 0;
  key.forEach((k, ki) => {
    if (exactKeys.has(ki)) return;
    const mi = marks.findIndex((m, i) => !used.has(i) && m.t0 <= k.t1 && m.t1 >= k.t0);
    if (mi === -1) {
      miss++;
      return;
    }
    used.add(mi);
    near++;
    const edge = toCharRange(tokens, k);
    cells.push({ ...toCharRange(tokens, marks[mi] as TokenRun), state: 'near', keyStart: edge.start, keyEnd: edge.end });
  });

  let fp = 0;
  marks.forEach((m, i) => {
    if (used.has(i)) return;
    fp++;
    cells.push({ ...toCharRange(tokens, m), state: 'fp' });
  });

  const total = key.length;
  const exact = exactKeys.size;
  const score = total === 0 ? 0 : Math.max(0, (exact - PENALTY_WEIGHT[penalty] * fp) / total);
  cells.sort((a, b) => a.start - b.start);
  return { exact, near, miss, fp, total, score, cells };
}

// ── the attempt ─────────────────────────────────────────────────────────────

/** What the server carries forward for one question between submits. */
export interface QuestionState {
  questionId: string;
  /** Checks made. A reveal is not one. */
  checks: number;
  /** 0..1 — the score of the first check; `null` until there was one. */
  firstScore: number | null;
  /** Passed on some check. */
  passed: boolean;
  revealed: boolean;
  /** No further check: passed, revealed, or out of checks. */
  closed: boolean;
}

export interface CheckInput {
  ex: HighlightInTextContent;
  questionId: string;
  /** Character offsets into the passage as sent. */
  marks: readonly CharRange[];
  /** «Vis fasit» — closes the question and returns its key. */
  reveal?: boolean;
  /** Carried forward by the server; absent on the attempt's first submit. */
  questions?: readonly QuestionState[];
}

/** A key span as the reveal shows it, numbered in text order. */
export interface KeySpan {
  n: number;
  start: number;
  end: number;
  why?: string;
}

export interface CheckResult {
  questionId: string;
  /** This check, 0-100 rounded. On a reveal: the question's first check. */
  pct: number;
  /** This question, this check. Never on a reveal. */
  passed: boolean;
  exact: number;
  near: number;
  /** A count — never positions (AC-S5). */
  miss: number;
  fp: number;
  total: number;
  /** The student's marks with their state. Empty on a reveal. */
  cells: Cell[];
  missHint?: string;
  fpHint?: string;
  /** Only on a reveal. */
  key?: KeySpan[];
  /** Which check of this question this was (a reveal reports the last check). */
  attempt: number;
  /** Checks of this question still allowed, or `null` for unlimited. */
  checksLeft: number | null;
  closed: boolean;
  revealed: boolean;
  /** Every ready question's state after this submit — to be carried into the next. */
  questions: QuestionState[];
  /** Every ready question is closed. */
  complete: boolean;
  /** …and this submit is the one that closed the last of them. */
  completedNow: boolean;
  /** The attempt: mean of first checks over the ready questions, 0-100 rounded. */
  attemptPct: number;
  /** `attemptPct ≥ threshold`, on the unrounded mean. */
  attemptPassed: boolean;
}

export type CheckRefusal =
  /** A mark covers no token (AC-G7). */
  | 'HT_MARK_UNSNAPPABLE'
  /** Not a ready question of this exercise. */
  | 'HT_QUESTION_UNKNOWN'
  /** Passed or revealed — nothing more to submit (AC-S9). Or out of checks, for a check. */
  | 'HT_QUESTION_CLOSED'
  /** `revealKey` off, or no failed check yet (SPEC_api_contract §4). */
  | 'HT_REVEAL_NOT_ALLOWED';

export type CheckOutcome = { ok: true; result: CheckResult } | { ok: false; code: CheckRefusal };

export function check(input: CheckInput): CheckOutcome {
  const { ex, questionId } = input;
  const s = ex.settings;
  const ready = readyQuestions(ex);
  const q = ready.find((x) => x.id === questionId);
  if (!q) return { ok: false, code: 'HT_QUESTION_UNKNOWN' };

  const carried = new Map((input.questions ?? []).map((st) => [st.questionId, st]));
  const before: QuestionState[] = ready.map((x) => carried.get(x.id) ?? fresh(x.id));
  const wasComplete = before.every((st) => st.closed);
  const prev = before.find((st) => st.questionId === questionId) as QuestionState;
  const max = maxChecks(s);
  const tokens = tokenize(ex.text);
  const key = spanRuns(tokens, q);

  let next: QuestionState;
  let result: Omit<CheckResult, 'questions' | 'complete' | 'completedNow' | 'attemptPct' | 'attemptPassed'>;

  if (input.reveal === true) {
    if (prev.passed || prev.revealed) return { ok: false, code: 'HT_QUESTION_CLOSED' };
    if (!s.revealKey || prev.checks === 0) return { ok: false, code: 'HT_REVEAL_NOT_ALLOWED' };

    next = { ...prev, revealed: true, closed: true };
    result = {
      questionId,
      pct: pctOf(prev.firstScore ?? 0),
      passed: false,
      exact: 0,
      near: 0,
      miss: 0,
      fp: 0,
      total: key.length,
      cells: [],
      key: key.map((k, i) => {
        const why = k.span.why.trim();
        return { n: i + 1, ...toCharRange(tokens, k), ...(why !== '' ? { why } : {}) };
      }),
      attempt: prev.checks,
      checksLeft: max === null ? null : Math.max(0, max - prev.checks),
      closed: true,
      revealed: true,
    };
  } else {
    if (prev.closed) return { ok: false, code: 'HT_QUESTION_CLOSED' };
    const snapped = snapMarks(ex.text, input.marks);
    if (!snapped.ok) return { ok: false, code: snapped.code };

    const g = grade(tokens, key, snapped.runs, s.penalty);
    // Compared in whole numbers, not on the float: 7 of 10 must pass a 70% mark.
    const passed = g.total > 0 && Math.max(0, g.exact - PENALTY_WEIGHT[s.penalty] * g.fp) * 100 >= s.threshold * g.total;
    const checks = prev.checks + 1;
    const checksLeft = max === null ? null : Math.max(0, max - checks);
    const closed = passed || checksLeft === 0;

    next = {
      questionId,
      checks,
      firstScore: prev.firstScore ?? g.score,
      passed: prev.passed || passed,
      revealed: false,
      closed,
    };
    result = {
      questionId,
      pct: pctOf(g.score),
      passed,
      exact: g.exact,
      near: g.near,
      miss: g.miss,
      fp: g.fp,
      total: g.total,
      cells: g.cells,
      ...(!passed && s.hints && g.miss > 0 && q.missHint.trim() !== '' ? { missHint: q.missHint.trim() } : {}),
      ...(!passed && s.hints && g.fp > 0 && q.fpHint.trim() !== '' ? { fpHint: q.fpHint.trim() } : {}),
      attempt: checks,
      checksLeft,
      closed,
      revealed: false,
    };
  }

  const questions = before.map((st) => (st.questionId === questionId ? next : st));
  const complete = questions.every((st) => st.closed);
  const mean = questions.reduce((n, st) => n + (st.firstScore ?? 0), 0) / questions.length;

  return {
    ok: true,
    result: {
      ...result,
      questions,
      complete,
      completedNow: complete && !wasComplete,
      attemptPct: pctOf(mean),
      attemptPassed: mean * 100 >= s.threshold,
    },
  };
}

function fresh(questionId: string): QuestionState {
  return { questionId, checks: 0, firstScore: null, passed: false, revealed: false, closed: false };
}

function pctOf(score: number): number {
  return Math.round(score * 100);
}
