// Applying a column preset, and deleting a column.
//
// Both are one operation with one trap, and IMPLEMENTATION.md names it twice: a preset
// **rebuilds** the columns with fresh ids, so every `row.answer` pointing at an old id has
// to be remapped in the same step or the keys are silently lost. The remap matches on the
// old column's *label*: "Riktig" survives a switch from Riktig/Galt to
// Riktig/Galt/Står-ikke, and an answer whose label disappears becomes `null` rather than
// pointing at whatever column happens to sit at that index.
//
// Matching by index would be the obvious alternative and is wrong for exactly that reason:
// Ja/Nei → Sant/Usant would keep every answer while changing what each one means.

import { column } from './derive.js';
import type { Column, MultipleChoiceGroupContent, Preset } from './model.js';
import { newColumn } from './model.js';

/**
 * Replace the column set, keeping the answers whose labels survive.
 *
 * Labels are compared case-insensitively and trimmed: an author who typed "riktig" over
 * the preset's "Riktig" has not made a different column.
 */
export function applyPreset(
  ex: MultipleChoiceGroupContent,
  preset: Preset,
): MultipleChoiceGroupContent {
  const columns = preset.columns.map(([label, short]) => newColumn(label, short));
  return remap(ex, columns);
}

/**
 * Whether this preset is the document's current column set — BEHAVIOR S1.7, which presses
 * the card when the labels match "label-for-label in order".
 */
export function matchesPreset(ex: MultipleChoiceGroupContent, preset: Preset): boolean {
  if (ex.columns.length !== preset.columns.length) return false;
  return ex.columns.every((c, i) => key(c.label) === key(preset.columns[i]![0]));
}

/**
 * Drop one column, clearing every answer that pointed at it — BEHAVIOR S1.10.
 *
 * Refuses to go below two columns rather than letting the caller check first: "a column set
 * needs at least two" is the same rule `issues` reports, and a builder that could delete
 * its way to one column would be producing a document the gate then refuses to publish.
 */
export function removeColumn(
  ex: MultipleChoiceGroupContent,
  columnId: string,
): MultipleChoiceGroupContent {
  if (ex.columns.length <= 2) return ex;
  if (column(ex, columnId) === null) return ex;

  return {
    ...ex,
    columns: ex.columns.filter((c) => c.id !== columnId),
    rows: ex.rows.map((r) => (r.answer === columnId ? { ...r, answer: null } : r)),
  };
}

/**
 * Add an empty column — BEHAVIOR S1.11. Capped at four, for the same reason
 * `removeColumn` floors at two.
 */
export function addColumn(ex: MultipleChoiceGroupContent): MultipleChoiceGroupContent {
  if (ex.columns.length >= 4) return ex;
  return { ...ex, columns: [...ex.columns, newColumn()] };
}

/** Swap in a new column set, carrying answers across by label. */
function remap(ex: MultipleChoiceGroupContent, columns: Column[]): MultipleChoiceGroupContent {
  const byLabel = new Map(columns.map((c) => [key(c.label), c.id]));

  return {
    ...ex,
    columns,
    rows: ex.rows.map((r) => {
      const old = column(ex, r.answer);
      if (old === null) return { ...r, answer: null };
      return { ...r, answer: byLabel.get(key(old.label)) ?? null };
    }),
  };
}

function key(label: string): string {
  return label.trim().toLowerCase();
}
