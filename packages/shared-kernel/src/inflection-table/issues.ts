// The validation engine for `inflection_table` — `itIssues` and `itStepState` of the handoff.
//
// One list drives the rail dots, the callouts in each step, the gate and the server's publish
// preflight. `blocker` is reserved for what makes the exercise physically unplayable (spec 19
// §1.2): no columns, nothing to ask, a cell the server cannot grade, a row nobody can read —
// and, by DECISIONS §3, a cell that would tell the student «feil» with no reason.
//
// Issues carry a code and the parameters a message needs, never the message: the teacher UI is
// translated into four languages. Every issue about one row or one cell names it — the
// prototype counted instead ("3 open cells have no key"), which cannot be drawn where it
// belongs (plan 69, deviation 11); the gate aggregates.
//
// The audio layer's issues are not here: they are the layer's (`audioIssues`), folded into
// step 5 by the builder and run by the preflight beside these, as for every other type.

import { distractorShortfall } from './bank.js';
import { norm } from './compare.js';
import { askedCells, cellOf, formsCoverage, isLinked } from './derive.js';
import type { InflectionTableContent } from './model.js';
import {
  IT_BANK_CROWDED,
  IT_FEW_ROWS,
  IT_MANY_ROWS,
  IT_MIN_SLOTS,
  packOf,
  paradigmOf,
  slotsGone,
  slotsInPlay,
} from './model.js';

export type IssueLevel = 'blocker' | 'warning' | 'info';

/** Which builder step owns the fix. Rail dots and the gate's jump links both use it. */
export type IssueStep = 1 | 2 | 3 | 4 | 5;

export type Issue =
  // ── Step 1 — paradigm ──
  | { code: 'IT_NO_PACK'; level: 'blocker'; step: 1; language: string }
  | { code: 'IT_TOO_FEW_SLOTS'; level: 'blocker'; step: 1; count: number }
  | { code: 'IT_SLOT_GONE'; level: 'warning'; step: 1; slotId: string }
  // ── Step 2 — lemmas and forms ──
  | { code: 'IT_NO_ROWS'; level: 'blocker'; step: 2 }
  | { code: 'IT_NOTHING_ASKED'; level: 'blocker'; step: 2 }
  | { code: 'IT_ROW_NO_LEMMA'; level: 'blocker'; step: 2; rowId: string }
  | { code: 'IT_CELL_NO_KEY'; level: 'blocker'; step: 2; rowId: string; slotId: string }
  | { code: 'IT_ROW_ALL_GIVEN'; level: 'warning'; step: 2; rowId: string }
  | { code: 'IT_FEW_ROWS'; level: 'warning'; step: 2; count: number }
  | { code: 'IT_MANY_ROWS'; level: 'warning'; step: 2; count: number }
  | { code: 'IT_SLOT_NEVER_ASKED'; level: 'warning'; step: 2; slotId: string }
  | { code: 'IT_DUPLICATE_LEMMA'; level: 'warning'; step: 2; rowId: string }
  | { code: 'IT_ROW_NOT_LINKED'; level: 'info'; step: 2; rowId: string }
  // ── Step 3 — reasons ──
  | { code: 'IT_CELL_NO_WHY'; level: 'blocker'; step: 3; rowId: string; slotId: string }
  // ── Step 4 — difficulty ──
  | { code: 'IT_BANK_NO_EXTRA'; level: 'warning'; step: 4 }
  | { code: 'IT_BANK_SHORT'; level: 'warning'; step: 4; missing: number }
  | { code: 'IT_BANK_TOO_BIG'; level: 'warning'; step: 4; count: number }
  | { code: 'IT_KEY_NEVER_SHOWN'; level: 'info'; step: 4 };

export type IssueCode = Issue['code'];

/** Everything wrong with the document, in authoring order: step 1, then 2, 3, 4. */
export function issues(ex: InflectionTableContent): Issue[] {
  const out: Issue[] = [];

  // ── Step 1 ────────────────────────────────────────────────────────────────
  // Without a pack there are no columns, and nothing below can be said (decision Q5-A).
  if (!packOf(ex) || !paradigmOf(ex)) {
    out.push({ code: 'IT_NO_PACK', level: 'blocker', step: 1, language: ex.language });
    return out;
  }
  const slots = slotsInPlay(ex);
  if (slots.length < IT_MIN_SLOTS) {
    out.push({ code: 'IT_TOO_FEW_SLOTS', level: 'blocker', step: 1, count: slots.length });
  }
  for (const slotId of slotsGone(ex)) {
    out.push({ code: 'IT_SLOT_GONE', level: 'warning', step: 1, slotId });
  }

  // ── Step 2 ────────────────────────────────────────────────────────────────
  const asked = askedCells(ex);
  if (ex.rows.length === 0) out.push({ code: 'IT_NO_ROWS', level: 'blocker', step: 2 });
  if (ex.rows.length > 0 && asked.length === 0) {
    out.push({ code: 'IT_NOTHING_ASKED', level: 'blocker', step: 2 });
  }
  for (const row of ex.rows) {
    if (row.lemma.trim() === '')
      out.push({ code: 'IT_ROW_NO_LEMMA', level: 'blocker', step: 2, rowId: row.id });
  }
  for (const c of asked) {
    if (c.cell.value.trim() === '') {
      out.push({
        code: 'IT_CELL_NO_KEY',
        level: 'blocker',
        step: 2,
        rowId: c.row.id,
        slotId: c.slot.id,
      });
    }
  }
  if (slots.length > 0) {
    for (const row of ex.rows) {
      if (slots.every((s) => cellOf(row, s.id).mode === 'prefill')) {
        out.push({ code: 'IT_ROW_ALL_GIVEN', level: 'warning', step: 2, rowId: row.id });
      }
    }
  }
  if (ex.rows.length > 0 && ex.rows.length < IT_FEW_ROWS) {
    out.push({ code: 'IT_FEW_ROWS', level: 'warning', step: 2, count: ex.rows.length });
  }
  if (ex.rows.length > IT_MANY_ROWS) {
    out.push({ code: 'IT_MANY_ROWS', level: 'warning', step: 2, count: ex.rows.length });
  }
  // The first slot in play is exempt: a column given throughout is the cue of «First column
  // given», the pattern DECISIONS names as the common one — not decoration. The prototype warns
  // on it, its own sample included (plan 69 §4.2, item 14).
  if (asked.length > 0) {
    const used = new Set(asked.map((c) => c.slot.id));
    for (const slot of slots.slice(1)) {
      if (!used.has(slot.id))
        out.push({ code: 'IT_SLOT_NEVER_ASKED', level: 'warning', step: 2, slotId: slot.id });
    }
  }
  // The second and later occurrences are named: the first is the one to keep.
  const seen = new Set<string>();
  for (const row of ex.rows) {
    const key = norm(row.lemma);
    if (key === '') continue;
    if (seen.has(key))
      out.push({ code: 'IT_DUPLICATE_LEMMA', level: 'warning', step: 2, rowId: row.id });
    seen.add(key);
  }
  // A fact, not a mistake (DECISIONS §2): a word not yet in the dictionary is legitimate.
  for (const row of ex.rows) {
    if (!isLinked(row))
      out.push({ code: 'IT_ROW_NOT_LINKED', level: 'info', step: 2, rowId: row.id });
  }

  // ── Step 3 ────────────────────────────────────────────────────────────────
  for (const c of asked) {
    if (c.cell.value.trim() !== '' && c.cell.why.trim() === '') {
      out.push({
        code: 'IT_CELL_NO_WHY',
        level: 'blocker',
        step: 3,
        rowId: c.row.id,
        slotId: c.slot.id,
      });
    }
  }

  // ── Step 4 ────────────────────────────────────────────────────────────────
  if (ex.input.mode === 'bank') {
    if (ex.input.bankExtra === 0) {
      out.push({ code: 'IT_BANK_NO_EXTRA', level: 'warning', step: 4 });
    } else {
      const missing = distractorShortfall(ex);
      if (missing > 0) out.push({ code: 'IT_BANK_SHORT', level: 'warning', step: 4, missing });
    }
    if (asked.length > IT_BANK_CROWDED) {
      out.push({ code: 'IT_BANK_TOO_BIG', level: 'warning', step: 4, count: asked.length });
    }
  }
  if (ex.settings.revealKey === 'never')
    out.push({ code: 'IT_KEY_NEVER_SHOWN', level: 'info', step: 4 });

  return out;
}

/** Whether the exercise may be published or assigned — the gate's and the preflight's question. */
export function isReady(ex: InflectionTableContent): boolean {
  return !issues(ex).some((i) => i.level === 'blocker');
}

export function blockers(ex: InflectionTableContent): Issue[] {
  return issues(ex).filter((i) => i.level === 'blocker');
}

export type StepStatus = 'ok' | 'warn' | 'err' | 'empty';

export interface StepState {
  s: StepStatus;
  errs: number;
}

/**
 * The rail dot for a step, in the prototype's order (`itStepState`): blockers first, then
 * warnings, then `empty` — step 2 without rows, step 3 without a single reason — then `ok`.
 * Info does not colour the dot. Step 5 is the audio layer's, whose problems the builder folds
 * in itself; here it is always `ok`.
 */
export function stepState(ex: InflectionTableContent, step: IssueStep): StepState {
  const own = issues(ex).filter((i) => i.step === step);
  const errs = own.filter((i) => i.level === 'blocker').length;
  if (errs > 0) return { s: 'err', errs };
  if (own.some((i) => i.level === 'warning')) return { s: 'warn', errs: 0 };
  const empty =
    (step === 2 && ex.rows.length === 0) || (step === 3 && formsCoverage(ex).withWhy === 0);
  return { s: empty ? 'empty' : 'ok', errs: 0 };
}
