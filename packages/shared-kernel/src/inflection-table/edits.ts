// Pure edits of an `inflection_table` document — the mutations of the handoff's steps.jsx.
//
// Every function returns a new document and leaves its argument alone, so the builder can keep
// an undo-free `setState(edit(current))` and tests can compare before and after.
//
// Where the prototype and its own documents disagree, the documents win (plan 69 §4.2):
//
//   * switching the paradigm clears the rows — DECISIONS §1, the rows are forms of *these*
//     columns — but the builder must say so first; `previewParadigmSwitch` is what it says;
//   * the dictionary picker respects the ten-row ceiling the «Type a lemma» button does;
//   * a variant is trimmed, never doubled and never the key itself.

import { norm } from './compare.js';
import { cellOf } from './derive.js';
import type {
  Cell,
  CellMode,
  InflectionTableContent,
  InputSettings,
  Row,
  Settings,
} from './model.js';
import {
  IT_MAX_ATTEMPTS,
  IT_MAX_BANK_EXTRA,
  IT_MAX_ROWS,
  IT_MIN_ATTEMPTS,
  IT_MIN_THRESHOLD,
  newCell,
  newId,
  packOf,
  paradigmOf,
  slotsInPlay,
} from './model.js';

export function setTitle(ex: InflectionTableContent, title: string): InflectionTableContent {
  return { ...ex, title };
}

export function setInstruction(
  ex: InflectionTableContent,
  instruction: string,
): InflectionTableContent {
  return { ...ex, instruction };
}

// ── Step 1 — paradigm and slots ─────────────────────────────────────────────

export interface ParadigmSwitch {
  /** Rows that would be cleared. Zero means the switch can happen without asking. */
  rowsCleared: number;
}

/** What switching to another paradigm would cost — shown before it happens (DECISIONS §1). */
export function previewParadigmSwitch(
  ex: InflectionTableContent,
  paradigmId: string,
): ParadigmSwitch {
  if (paradigmId === ex.paradigmId) return { rowsCleared: 0 };
  return { rowsCleared: ex.rows.length };
}

/** Another paradigm: all of its slots in play, and no rows. */
export function pickParadigm(
  ex: InflectionTableContent,
  paradigmId: string,
): InflectionTableContent {
  if (paradigmId === ex.paradigmId) return ex;
  const paradigm = packOf(ex)?.paradigms.find((p) => p.id === paradigmId);
  if (!paradigm) return ex;
  return { ...ex, paradigmId, slots: paradigm.slots.map((s) => s.id), rows: [] };
}

/**
 * A slot on or off, kept in the pack's order whatever order it was clicked in. Cells of a slot
 * switched off stay on their rows and come back with it (plan 69 §3.1).
 */
export function toggleSlot(ex: InflectionTableContent, slotId: string): InflectionTableContent {
  const paradigm = paradigmOf(ex);
  if (!paradigm || !paradigm.slots.some((s) => s.id === slotId)) return ex;
  const on = ex.slots.includes(slotId);
  const next = new Set(on ? ex.slots.filter((s) => s !== slotId) : [...ex.slots, slotId]);
  return { ...ex, slots: paradigm.slots.map((s) => s.id).filter((id) => next.has(id)) };
}

// ── Step 2 — rows and cells ─────────────────────────────────────────────────

export function canAddRow(ex: InflectionTableContent): boolean {
  return ex.rows.length < IT_MAX_ROWS;
}

/**
 * Append a row built elsewhere (`fromDictionary`). Refused at the ceiling and for a dictionary
 * entry already in the table — the picker shows such entries ticked and disabled.
 */
export function addRow(ex: InflectionTableContent, row: Row): InflectionTableContent {
  if (!canAddRow(ex)) return ex;
  if (row.dictId !== null && ex.rows.some((r) => r.dictId === row.dictId)) return ex;
  return { ...ex, rows: [...ex.rows, row] };
}

/** A typed lemma: empty, not linked, first slot given and the rest asked. */
export function addManualRow(ex: InflectionTableContent): InflectionTableContent {
  const cells: Record<string, Cell> = {};
  slotsInPlay(ex).forEach((slot, index) => {
    cells[slot.id] = newCell('', index === 0 ? 'prefill' : 'ask');
  });
  return addRow(ex, { id: newId(), lemma: '', gloss: '', dictId: null, cells });
}

export function removeRow(ex: InflectionTableContent, rowId: string): InflectionTableContent {
  return { ...ex, rows: ex.rows.filter((r) => r.id !== rowId) };
}

export function setLemma(
  ex: InflectionTableContent,
  rowId: string,
  lemma: string,
): InflectionTableContent {
  return mapRow(ex, rowId, (row) => ({ ...row, lemma }));
}

export function setCellMode(
  ex: InflectionTableContent,
  rowId: string,
  slotId: string,
  mode: CellMode,
): InflectionTableContent {
  return mapCell(ex, rowId, slotId, (cell) => ({ ...cell, mode }));
}

export function setCellValue(
  ex: InflectionTableContent,
  rowId: string,
  slotId: string,
  value: string,
): InflectionTableContent {
  return mapCell(ex, rowId, slotId, (cell) => ({ ...cell, value }));
}

/** «First column given»: the first slot in play given, every other asked — on every row. */
export function bulkFirstGiven(ex: InflectionTableContent): InflectionTableContent {
  return bulk(ex, (index) => (index === 0 ? 'prefill' : 'ask'));
}

/** «Open everything»: every cell in play asked. */
export function bulkOpenAll(ex: InflectionTableContent): InflectionTableContent {
  return bulk(ex, () => 'ask');
}

// ── Step 3 — reasons and variants ───────────────────────────────────────────

export function setWhy(
  ex: InflectionTableContent,
  rowId: string,
  slotId: string,
  why: string,
): InflectionTableContent {
  return mapCell(ex, rowId, slotId, (cell) => ({ ...cell, why }));
}

/** A variant for this cell only. Trimmed; ignored when empty, already there, or the key itself. */
export function addAccept(
  ex: InflectionTableContent,
  rowId: string,
  slotId: string,
  variant: string,
): InflectionTableContent {
  const text = variant.trim();
  const n = norm(text);
  if (n === '') return ex;
  return mapCell(ex, rowId, slotId, (cell) =>
    norm(cell.value) === n || cell.accept.some((a) => norm(a) === n)
      ? cell
      : { ...cell, accept: [...cell.accept, text] },
  );
}

export function removeAccept(
  ex: InflectionTableContent,
  rowId: string,
  slotId: string,
  index: number,
): InflectionTableContent {
  return mapCell(ex, rowId, slotId, (cell) => ({
    ...cell,
    accept: cell.accept.filter((_, i) => i !== index),
  }));
}

// ── Step 4 — dials ──────────────────────────────────────────────────────────

export function updateInput(
  ex: InflectionTableContent,
  patch: Partial<InputSettings>,
): InflectionTableContent {
  const input = { ...ex.input, ...patch };
  input.bankExtra = clamp(Math.round(input.bankExtra), 0, IT_MAX_BANK_EXTRA);
  return { ...ex, input };
}

export function updateSettings(
  ex: InflectionTableContent,
  patch: Partial<Settings>,
): InflectionTableContent {
  const settings = { ...ex.settings, ...patch };
  settings.attempts = clamp(Math.round(settings.attempts), IT_MIN_ATTEMPTS, IT_MAX_ATTEMPTS);
  settings.threshold = clamp(Math.round(settings.threshold), IT_MIN_THRESHOLD, 100);
  return { ...ex, settings };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapRow(
  ex: InflectionTableContent,
  rowId: string,
  fn: (row: Row) => Row,
): InflectionTableContent {
  return { ...ex, rows: ex.rows.map((r) => (r.id === rowId ? fn(r) : r)) };
}

function mapCell(
  ex: InflectionTableContent,
  rowId: string,
  slotId: string,
  fn: (cell: Cell) => Cell,
): InflectionTableContent {
  return mapRow(ex, rowId, (row) => ({
    ...row,
    cells: { ...row.cells, [slotId]: fn(cellOf(row, slotId)) },
  }));
}

function bulk(
  ex: InflectionTableContent,
  modeAt: (index: number) => CellMode,
): InflectionTableContent {
  const slots = slotsInPlay(ex);
  return {
    ...ex,
    rows: ex.rows.map((row) => {
      const cells = { ...row.cells };
      slots.forEach((slot, index) => {
        cells[slot.id] = { ...cellOf(row, slot.id), mode: modeAt(index) };
      });
      return { ...row, cells };
    }),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
