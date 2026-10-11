// Grading for `information_transfer`: a verdict per cell, and the whole blank per check.
//
// ── Six verdicts, per cell, always (DECISIONS §2) ───────────────────────────
//   ok      the right fact, written as one of the author's wordings
//   format  the right fact in a notation the author did not list — counted, and the student is
//           shown the standard form («kl 17.30» → 17:30)
//   typo    one character off a lexical answer, only when the author allows it
//   unread  the core could not read this as a time/date/number at all — told so, rather than
//           marked wrong on content; the report's «did not understand the form» signal
//   wrong   read fine, a different fact
//   empty   left blank
// A typo is never forgiven a number: `405` is not a near-miss for `450`, it is the wrong fact.
// There is no false-positive penalty — every cell is free input, there is nothing to sweep.
//
// ── The blank is checked whole, the way `inflection_table` is (plan 73 §3.6) ─
// One «Sjekk svarene» sends every cell; the cells found right lock; «Rett opp N felt» sends the
// blank again with the wrong ones re-answered; the author's budget closes it — and so does a
// check that passes, as the prototype's runner offers «Ny runde» the moment `result.pass` holds.
// What the engine records is the **first** check (plan 66 §3.3, plan 69 §3.4): later checks
// change what the student sees and never the score. The first answer of every cell is carried
// forward (`firstValues`).
//
// ── How much of the key a check returns ─────────────────────────────────────
//   * the verdict of every cell, and the author's reason for every cell not counted — on every
//     check («The explanation always comes with the verdict», step 4);
//   * the standard form of a `format` or `typo` cell — always: the student was right;
//   * the expected value of a cell not counted — by `revealKey`: with the verdict
//     (`immediately`), once the blank is closed (`afterLastAttempt`), or never;
//   * the hints under the labels — from the first check on, under `hintsAfter: 1`.
// A graded delivery is one check and never shows the key (Q8-A of plan 67).

import { levenshtein } from '../short-answer/matching.js';
import { expectedOf, packOf, readyFields } from './derive.js';
import { canon, normText } from './formats.js';
import type { Field, Grading, InformationTransferContent } from './model.js';
import { isFormatType, maxChecks } from './model.js';
import type { FormatPack } from './packs/index.js';

export type Verdict = 'ok' | 'format' | 'typo' | 'unread' | 'wrong' | 'empty';

export const VERDICTS: readonly Verdict[] = ['ok', 'format', 'typo', 'unread', 'wrong', 'empty'];

export interface CellGrade {
  verdict: Verdict;
  /**
   * The author's first wording. For `format`/`typo` it is the standard form shown beside a right
   * answer; for the rest it is the key, and leaves the server only when `revealKey` allows.
   */
  canonical?: string;
}

/** Counted as right. */
export function passes(verdict: Verdict): boolean {
  return verdict === 'ok' || verdict === 'format' || verdict === 'typo';
}

/** One cell (`infGradeCell`). */
export function gradeCell(
  field: Pick<Field, 'type' | 'expected'>,
  raw: string,
  grading: Grading,
  pack: FormatPack | undefined,
): CellGrade {
  const expected = expectedOf(field);
  const first = expected[0];
  const given = String(raw ?? '').trim();
  // DECISIONS §2: an empty cell is «as wrong, without the scolding» — the key goes with it when
  // the settings allow, which the prototype forgot (plan 73 §4.2).
  if (given === '') return first === undefined ? { verdict: 'empty' } : { verdict: 'empty', canonical: first };
  if (first === undefined) return { verdict: 'empty' };

  const format = isFormatType(field.type);
  const got = canon(field.type, given, pack, grading);
  if (format && got.length === 0) return { verdict: 'unread', canonical: first };

  const keys = new Set(expected.flatMap((e) => canon(field.type, e, pack, grading)));
  if (got.some((c) => keys.has(c))) {
    const literal = expected.some((e) =>
      grading.strictCase ? e === given : normText(e) === normText(given),
    );
    return literal ? { verdict: 'ok' } : { verdict: 'format', canonical: first };
  }

  if (!format && grading.typos) {
    const n = normText(given);
    const near = expected.some((e) => {
      const c = normText(e);
      return c.length > 3 && levenshtein(c, n) <= 1;
    });
    if (near) return { verdict: 'typo', canonical: first };
  }
  return { verdict: 'wrong', canonical: first };
}

/**
 * The author's own key through the author's own grader (`infKeyPasses`). Catches an expected
 * value the normaliser cannot read — `expected: "halv fire"` on a field typed *Number*.
 */
export function keyPasses(ex: InformationTransferContent): boolean {
  const pack = packOf(ex);
  return readyFields(ex).every(
    (f) => gradeCell(f, expectedOf(f)[0] ?? '', ex.grading, pack).verdict === 'ok',
  );
}

export interface CheckInput {
  ex: InformationTransferContent;
  /** Answers by field id. A cell left out is empty. */
  answers: Readonly<Record<string, string>>;
  /** 1-based: which check of the blank this is. */
  attempt: number;
  /** Cells an earlier check found right. They stay right and stay put. */
  locked?: readonly string[];
  /** The answer of each cell on the first check, carried forward by the server. */
  firstValues?: Readonly<Record<string, string>>;
  /** A graded delivery: one check, no key (Q8-A of plan 67). */
  graded?: boolean;
}

export interface CellOutcome {
  /** The field id — also the `itemKey` its evidence and review card are filed under. */
  id: string;
  /** What stands in the cell now; empty when left empty. */
  value: string;
  verdict: Verdict;
  /** The verdict of the first check — what the score and the report count. */
  firstVerdict: Verdict;
  ok: boolean;
  firstOk: boolean;
  /** See `CellGrade.canonical`; present only when it may be shown now. */
  canonical?: string;
  /** The author's reason. On a cell not counted. */
  why?: string;
  /** The hint under the label, once `hintsAfter: 1` lets it out. */
  hint?: string;
}

export interface CheckResult {
  cells: CellOutcome[];
  /** Ready cells. */
  total: number;
  /** Cells right on the first check. */
  correct: number;
  /** Cells right now — the progress bar. */
  correctNow: number;
  /** 0–100, rounded, over the first check. */
  pct: number;
  /** Required cells missed on the first check. */
  missedRequired: number;
  /** The record: the first check against the pass mark (and every required cell, if asked). */
  passed: boolean;
  /** The pass mark — sent back with the verdict, never with the projection (plan 73 §5, 14). */
  passPct: number;
  attempt: number;
  /** Checks still allowed, or `null` for unlimited. */
  checksLeft: number | null;
  /** No further check: the blank passes now, or the budget is spent. */
  closed: boolean;
  /** Whether the expected values of the cells not counted are in this result. */
  revealed: boolean;
  /** Cumulative: every cell found right on any check so far. */
  locked: string[];
  /** To be carried into the next check. */
  firstValues: Record<string, string>;
}

function percent(right: number, total: number): number {
  return total === 0 ? 0 : Math.round((right / total) * 100);
}

export function check(input: CheckInput): CheckResult {
  const { ex, attempt } = input;
  const graded = input.graded === true;
  const pack = packOf(ex);
  const already = new Set(input.locked ?? []);
  const first = input.firstValues;

  const rows = readyFields(ex).map((field) => {
    const raw = input.answers[field.id];
    const sent = typeof raw === 'string' ? raw.trim() : '';
    let grade = gradeCell(field, sent, ex.grading, pack);
    let value = sent;
    // A locked cell cannot change. If the client sends something no longer right, the cell keeps
    // the author's wording — it was right, and that is what it was right as.
    if (already.has(field.id) && !passes(grade.verdict)) {
      value = expectedOf(field)[0] ?? '';
      grade = gradeCell(field, value, ex.grading, pack);
    }
    const firstValue = first !== undefined && field.id in first ? (first[field.id] ?? '') : value;
    const firstGrade = firstValue === value ? grade : gradeCell(field, firstValue, ex.grading, pack);
    return { field, value, grade, firstValue, firstGrade };
  });

  const total = rows.length;
  const correct = rows.filter((r) => passes(r.firstGrade.verdict)).length;
  const correctNow = rows.filter((r) => passes(r.grade.verdict)).length;
  const pct = percent(correct, total);
  const pctNow = percent(correctNow, total);
  const required = rows.filter((r) => r.field.required);
  const missedRequired = required.filter((r) => !passes(r.firstGrade.verdict)).length;
  const missedRequiredNow = required.filter((r) => !passes(r.grade.verdict)).length;
  const passMark = (p: number, missed: number): boolean =>
    total > 0 && p >= ex.scoring.passPct && (!ex.grading.requiredAll || missed === 0);

  const max = maxChecks(ex.answering, graded);
  const checksLeft = max === null ? null : Math.max(0, max - attempt);
  const closed = passMark(pctNow, missedRequiredNow) || checksLeft === 0;
  const reveal = graded ? 'never' : ex.answering.revealKey;
  const revealed = reveal === 'immediately' || (reveal === 'afterLastAttempt' && closed);
  const hints = !graded && ex.answering.hintsAfter === 1;

  const cells = rows.map(({ field, value, grade, firstGrade }): CellOutcome => {
    const ok = passes(grade.verdict);
    const out: CellOutcome = {
      id: field.id,
      value,
      verdict: grade.verdict,
      firstVerdict: firstGrade.verdict,
      ok,
      firstOk: passes(firstGrade.verdict),
    };
    if (grade.canonical !== undefined && (ok || revealed)) out.canonical = grade.canonical;
    if (!ok && field.why.trim() !== '') out.why = field.why.trim();
    // Under every label, as the prototype prints it once the first attempt is in.
    if (hints && field.hint.trim() !== '') out.hint = field.hint.trim();
    return out;
  });

  const firstValues: Record<string, string> = {};
  for (const r of rows) firstValues[r.field.id] = r.firstValue;

  return {
    cells,
    total,
    correct,
    correctNow,
    pct,
    missedRequired,
    passed: passMark(pct, missedRequired),
    passPct: ex.scoring.passPct,
    attempt,
    checksLeft,
    closed,
    revealed,
    locked: [...new Set([...already, ...cells.filter((c) => c.ok).map((c) => c.id)])],
    firstValues,
  };
}
