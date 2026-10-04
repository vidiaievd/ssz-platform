// Grading for `inflection_table`: the whole table at once, and what a check leaves behind.
//
// The mechanics are `sort_into_buckets`' (plan 69 §3.4, plan 66 §3.1): one `Sjekk` sends every
// asked cell; right cells lock; «Prøv de gale på nytt» sends the table again with the wrong ones
// re-answered; the author's budget (1–4 checks) closes it. It runs on the server over the
// server's document — the client supplies forms and nothing else.
//
// ── The score is the first check ────────────────────────────────────────────
// What the engine records is **first-check accuracy over all graded cells**: a cell left empty
// on the first check counts as wrong (plan 66 Q5-A, decision Q6-A here). Later checks change
// what the student sees and never the score; the first form of every cell is carried forward
// (`firstValues`) the way sort carries `firstBuckets`.
//
// ── The bank penalises a false positive ─────────────────────────────────────
// DECISIONS: «Bank mode is scored with a false-positive penalty. Otherwise the student sweeps
// the bank across the grid.» A form placed in a cell it does not belong to costs one right
// cell; an empty cell is simply wrong. In typing mode a wrong cell costs nothing extra (step
// 4). The pass mark is decided in integers, as plans 67 and 68 do.
//
// ── How much of the key a check returns ─────────────────────────────────────
//   * whether each cell is right, its near miss and the author's reason for a wrong one — on
//     every check: DECISIONS §3 wants the student told it was the definite, not that they were
//     close, and the prototype shows both at once (plan 69 §3.5);
//   * the correct form of a wrong cell — by `revealKey`: after any check (`afterFirst`), once
//     the budget is spent (`afterLast`), never (`never`).
//
// Three grains, all recorded on every check (DECISIONS §2): the cell (`cells`), the row
// (`rows`), the table (`pct`/`passed`). Whether the row chip is drawn is a display setting.

import { inBank } from './bank.js';
import type { NearMiss } from './compare.js';
import { cellOk, nearMiss, norm } from './compare.js';
import { gradedCells } from './derive.js';
import type { InflectionTableContent } from './model.js';
import { maxChecks } from './model.js';

export interface CheckInput {
  ex: InflectionTableContent;
  /** Forms by cell key (`rowId:slotId`). A cell left out is empty. */
  answers: Readonly<Record<string, string>>;
  /** 1-based: which check of the table this is. */
  attempt: number;
  /** Cells an earlier check found right. They stay right and stay put. */
  locked?: readonly string[];
  /**
   * The form of each cell on the first check, carried forward by the server. Absent on the
   * first check — and on a later one only if the attempt lost its details, in which case this
   * check stands in for the first.
   */
  firstValues?: Readonly<Record<string, string>>;
  /** A graded delivery: one check, whatever the author's budget (Q8-A of plan 67). */
  graded?: boolean;
}

export interface CellOutcome {
  /** `rowId:slotId` — also the `itemKey` its evidence and review card are filed under. */
  key: string;
  rowId: string;
  slotId: string;
  /** What stands in the cell now; empty when left empty. */
  value: string;
  ok: boolean;
  /** Right on the first check — what the score counts. */
  firstOk: boolean;
  /** Only on a wrong, non-empty cell. */
  near?: NearMiss;
  /** The author's reason. Only on a wrong cell, and only when written. */
  why?: string;
  /** The correct form of a wrong cell, when `revealKey` allows it now. */
  correct?: string;
}

export interface RowOutcome {
  rowId: string;
  asked: number;
  /** Right now. */
  ok: number;
  /** Right on the first check. */
  firstOk: number;
}

export interface CheckResult {
  cells: CellOutcome[];
  rows: RowOutcome[];
  /** Graded cells. */
  total: number;
  /** Cells right on the first check. */
  correct: number;
  /** Cells right now — the progress bar and the live region. */
  correctNow: number;
  /** Bank only: cells filled wrongly on the first check, each costing one right cell. */
  falsePositives: number;
  /** 0–100, rounded, over the first check and after the penalty. */
  pct: number;
  /** The pass mark, decided in integers. */
  passed: boolean;
  attempt: number;
  checksLeft: number;
  /** No further check: every cell right, or the budget spent. */
  closed: boolean;
  /** Cumulative: every cell found right on any check so far. */
  locked: string[];
  /** To be carried into the next check. */
  firstValues: Record<string, string>;
}

export function check(input: CheckInput): CheckResult {
  const { ex, attempt } = input;
  const bank = ex.input.mode === 'bank';
  const already = new Set(input.locked ?? []);
  const first = input.firstValues;

  const graded = gradedCells(ex).map((c) => {
    const sent =
      typeof input.answers[c.key] === 'string' ? (input.answers[c.key] as string).trim() : '';
    // A bank answer that is not in the bank is a client bug and reads as empty.
    const offered = bank && sent !== '' && !inBank(ex, sent) ? '' : sent;
    // A locked cell cannot change. What the client sent stands only if it is still right;
    // otherwise the cell shows its key — it was right, and that is what it was right with.
    const value = already.has(c.key) && !cellOk(c.cell, offered) ? c.cell.value.trim() : offered;
    const ok = cellOk(c.cell, value);
    const firstValue = first !== undefined && c.key in first ? (first[c.key] ?? '') : value;
    const firstOk = cellOk(c.cell, firstValue);
    return { c, value, ok, firstValue, firstOk };
  });

  const total = graded.length;
  const correct = graded.filter((g) => g.firstOk).length;
  const correctNow = graded.filter((g) => g.ok).length;
  const falsePositives = bank
    ? graded.filter((g) => !g.firstOk && norm(g.firstValue) !== '').length
    : 0;
  const earned = Math.max(0, correct - falsePositives);
  const pct = total === 0 ? 0 : Math.round((earned / total) * 100);

  const max = input.graded === true ? 1 : maxChecks(ex.settings);
  const checksLeft = Math.max(0, max - attempt);
  const allRight = total > 0 && correctNow === total;
  const closed = allRight || checksLeft === 0;
  // A graded delivery never shows the key (Q8-A of plan 67).
  const reveal = input.graded === true ? 'never' : ex.settings.revealKey;
  const showKey = reveal === 'afterFirst' || (reveal === 'afterLast' && checksLeft === 0);

  const cells = graded.map(({ c, value, ok, firstOk }): CellOutcome => {
    const out: CellOutcome = { key: c.key, rowId: c.row.id, slotId: c.slot.id, value, ok, firstOk };
    if (ok) return out;
    const near = nearMiss(c.cell, value, ex.language);
    if (near !== null) out.near = near;
    if (c.cell.why.trim() !== '') out.why = c.cell.why.trim();
    if (showKey) out.correct = c.cell.value.trim();
    return out;
  });

  const rows: RowOutcome[] = [];
  for (const g of graded) {
    let row = rows.find((r) => r.rowId === g.c.row.id);
    if (!row) {
      row = { rowId: g.c.row.id, asked: 0, ok: 0, firstOk: 0 };
      rows.push(row);
    }
    row.asked += 1;
    if (g.ok) row.ok += 1;
    if (g.firstOk) row.firstOk += 1;
  }

  const firstValues: Record<string, string> = {};
  for (const g of graded) firstValues[g.c.key] = g.firstValue;

  return {
    cells,
    rows,
    total,
    correct,
    correctNow,
    falsePositives,
    pct,
    // `earned / total >= threshold / 100`, in integers.
    passed: total > 0 && earned * 100 >= ex.settings.threshold * total,
    attempt,
    checksLeft,
    closed,
    locked: [...new Set([...already, ...graded.filter((g) => g.ok).map((g) => g.c.key)])],
    firstValues,
  };
}
