// Derived views of an `inflection_table` document — `itAsked`, `itAskedCells`, `itFilled`,
// `itWithWhy` of the handoff, plus the one filter of what a student sees.
//
// Nothing here is stored (plan 69 §3.1): counts, the row's origin, readiness — each is read off
// the document when it is needed, so there is no second copy to fall out of step.

import type { DerivedTarget } from '../exercise-items/model.js';
import type { Slot } from './packs.js';
import type { Cell, InflectionTableContent, Row } from './model.js';
import { cellKey, newCell, slotsInPlay } from './model.js';

export interface AskedCell {
  row: Row;
  slot: Slot;
  cell: Cell;
  /** `rowId:slotId`. */
  key: string;
}

/** The cell of a row in a slot — a fresh asked cell where the row has none yet (slot just switched on). */
export function cellOf(row: Row, slotId: string): Cell {
  return row.cells[slotId] ?? newCell('', 'ask');
}

/** Every asked cell of the slots in play, in table order (row by row, slot by slot). */
export function askedCells(ex: InflectionTableContent): AskedCell[] {
  const slots = slotsInPlay(ex);
  const out: AskedCell[] = [];
  for (const row of ex.rows) {
    for (const slot of slots) {
      const cell = cellOf(row, slot.id);
      if (cell.mode === 'ask') out.push({ row, slot, cell, key: cellKey(row.id, slot.id) });
    }
  }
  return out;
}

/** Rows a student can read: they have a lemma. */
export function readyRows(ex: InflectionTableContent): Row[] {
  return ex.rows.filter((r) => r.lemma.trim() !== '');
}

/**
 * The cells a student is asked and the server grades: asked, in a ready row, with a key.
 *
 * The single filter of what reaches the student. A cell without a key cannot be graded and a
 * row without a lemma cannot be read; both are blockers (issues.ts), so a published table has
 * none — the filter only matters to a half-written draft in the preview.
 */
export function gradedCells(ex: InflectionTableContent): AskedCell[] {
  return askedCells(ex).filter((c) => c.row.lemma.trim() !== '' && c.cell.value.trim() !== '');
}

export interface FormsCoverage {
  /** Cells of the slots in play, across all rows. */
  total: number;
  asked: number;
  /** Asked cells with a key. */
  filled: number;
  /** Asked cells with a reason. */
  withWhy: number;
}

/** The step 2 meter: «A / T cells asked · F of A have a key · W have a reason». */
export function formsCoverage(ex: InflectionTableContent): FormsCoverage {
  const asked = askedCells(ex);
  return {
    total: ex.rows.length * slotsInPlay(ex).length,
    asked: asked.length,
    filled: asked.filter((c) => c.cell.value.trim() !== '').length,
    withWhy: asked.filter((c) => c.cell.why.trim() !== '').length,
  };
}

/** Whether the row came from the course dictionary — the prototype's `source`. */
export function isLinked(row: Row): boolean {
  return row.dictId !== null;
}

export type CeilingCause = 'hint';

/**
 * Why a success here proves one step less than its form says, or `null` (decision Q3-A).
 *
 * The key's first letter in an empty cell hands part of the answer over — the rule
 * `evidence-strength.ts` states for `lowered`, applied before to the sort counter, the
 * highlight count and the dictation word count. The engine sends it as `evidenceLowered`;
 * step 4 says it under the toggle. The bank's weaker evidence is not a cause here: it is a
 * different answer form, and the engine reports it as one (`answerForm`).
 */
export function ceilingCause(ex: InflectionTableContent): CeilingCause | null {
  return ex.settings.hintFirstLetter ? 'hint' : null;
}

/** The first letter of the key, as the hint shows it. Empty for an empty key. */
export function firstLetter(value: string): string {
  return [...value.trim()][0] ?? '';
}

/**
 * The vocabulary half of every graded cell's address (decision Q1-B, DECISIONS §2).
 *
 * A row from the course dictionary feeds its word on each cell it asks, as `context`: the learner
 * has to know `bok` to write `bøkene`, but the cell examines the column's rule. A row typed by hand
 * contributes nothing here — «rows typed by hand contribute only to the grammar atom», and the
 * grammar atom is the author's, set in the shared targets panel like every other type's.
 */
export function derivedTargets(ex: InflectionTableContent): DerivedTarget[] {
  return gradedCells(ex)
    .filter((c) => c.row.dictId !== null)
    .map((c) => ({
      itemKey: c.key,
      atomType: 'vocabulary_item' as const,
      atomId: c.row.dictId as string,
      role: 'context' as const,
    }));
}
