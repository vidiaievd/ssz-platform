// Model for the `inflection_table` exercise.
//
// Source of truth: docs/design/activity-specs/04_design_handoff_inflection_table/ in
// ssz-platform-web (README + DECISIONS + the prototype), as amended by
// docs/plan/69-inflection-table.md.
//
// `en jobb – jobben – jobber – jobbene` is one system, not four gaps. Three ideas from the
// handoff shape everything here:
//
//   1. **One table, not four gaps.** A row is an element with its own verdict; a cell is
//      addressed `rowId:slotId` (`cellKey`) and carries its own key and its own reason.
//   2. **The columns belong to the language pack** (packs.ts). The document records which
//      pack and which version it was authored against, which paradigm, and the subset of
//      that paradigm's slots in play — never a heading of its own.
//   3. **Suggested is not correct.** A row pulled from the course dictionary arrives with
//      suggested forms and a `dictId`; every asked cell still needs an author-confirmed key and
//      an author-written reason (DECISIONS §3).
//
// Field names are camelCase (plan 34 §7). `source` of the prototype is not stored: a row came
// from the dictionary exactly when it has a `dictId` (plan 69 §3.1). The audio block is not
// part of this model — it rides beside the document the way it does for `sort_into_buckets`.

import type { Paradigm, ParadigmPack, Slot } from './packs.js';
import { packById, packFor } from './packs.js';

/** A row is an element of a table that still fits a phone; six fit without scrolling (README). */
export const IT_MAX_ROWS = 10;

/** One column is a short answer, not a table. */
export const IT_MIN_SLOTS = 2;

/** Two rows or fewer: the student can pattern-match instead of inflecting. */
export const IT_FEW_ROWS = 3;

/** More than this is a long grid on a phone. */
export const IT_MANY_ROWS = 6;

/** A bank of more than a dozen forms is a scanning task, not a grammar one. */
export const IT_BANK_CROWDED = 12;

export type CellMode = 'prefill' | 'ask';

export interface Cell {
  /** `prefill` — given, part of the task; `ask` — the student produces it. */
  mode: CellMode;
  /** The form. For an asked cell this is the key and lives in `expected_answers`. */
  value: string;
  /** Variants accepted in this cell only — never a global tolerance (DECISIONS). */
  accept: string[];
  /** Why this form and not another — the sentence the student reads instead of «feil». */
  why: string;
}

export interface Row {
  /** Stable — reordering the table must not move anybody's explanations (plan 54). */
  id: string;
  /** The dictionary form as the student reads it: «ei bok», «å søke». */
  lemma: string;
  /** Meaning in the language of explanation, copied from the dictionary at the time of pulling. */
  gloss: string;
  /** The course dictionary entry (`vocabulary_items.id`), `null` for a lemma typed by hand. */
  dictId: string | null;
  /** Keyed by slot id. Cells of slots switched off stay here and come back when switched on. */
  cells: Record<string, Cell>;
}

export type InputMode = 'type' | 'bank';

export interface InputSettings {
  /** Typing produces the letters; a bank offers them — recognition (plan 69, deviation 1). */
  mode: InputMode;
  /** Distractors in the bank, 0–5 — forms that belong to no cell. */
  bankExtra: number;
  /** The order of lemmas is not what is being learned. Dealt by the server per attempt. */
  shuffleRows: boolean;
}

/** When the full paradigm is shown in the wrong cells. */
export type RevealKey = 'afterLast' | 'afterFirst' | 'never';

export const REVEAL_KEYS: readonly RevealKey[] = ['afterLast', 'afterFirst', 'never'];

export interface Settings {
  /** Checks of the table, 1–4. Partial credit is per cell, so a second check is cheap. */
  attempts: number;
  /** Pass mark, percent of asked cells, compared with `>=`. 50–100. */
  threshold: number;
  revealKey: RevealKey;
  /** The key's first letter in an empty cell. Lowers the evidence ceiling (decision Q3-A). */
  hintFirstLetter: boolean;
  /** Whether the row chip is shown. The row verdict is recorded either way. */
  rowVerdict: boolean;
}

export const DEFAULT_INPUT: InputSettings = { mode: 'type', bankExtra: 3, shuffleRows: true };

export const DEFAULT_SETTINGS: Settings = {
  attempts: 2,
  threshold: 75,
  revealKey: 'afterLast',
  hintFirstLetter: false,
  rowVerdict: true,
};

export const IT_MIN_ATTEMPTS = 1;
export const IT_MAX_ATTEMPTS = 4;
export const IT_MAX_BANK_EXTRA = 5;
export const IT_MIN_THRESHOLD = 50;

/** The whole document, as the builder edits it. */
export interface InflectionTableContent {
  title: string;
  /** Above the grid, in the target language. */
  instruction: string;
  /** The course language — the pack is chosen by it (decision Q2-A of plan 68). */
  language: string;
  /** Pack id and version the exercise was authored against (DECISIONS §1). Empty without a pack. */
  packId: string;
  packVersion: string;
  /** Which slot set of the pack. Empty without a pack. */
  paradigmId: string;
  /** Slots in play, in the pack's canonical order. */
  slots: string[];
  rows: Row[];
  input: InputSettings;
  settings: Settings;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function newCell(value = '', mode: CellMode = 'ask'): Cell {
  return { mode, value, accept: [], why: '' };
}

/** `rowId:slotId` — the cell's address in the key, the verdict and the review queue. */
export function cellKey(rowId: string, slotId: string): string {
  return `${rowId}:${slotId}`;
}

/** The inverse of `cellKey`; `null` for anything that is not one. */
export function parseCellKey(key: string): { rowId: string; slotId: string } | null {
  const at = key.indexOf(':');
  if (at <= 0 || at === key.length - 1) return null;
  return { rowId: key.slice(0, at), slotId: key.slice(at + 1) };
}

/**
 * A blank document for a course language: the pack's first paradigm, every slot in play, no
 * rows. No Norwegian is written into it — the instruction stays empty and the pack offers its
 * placeholder. Without a pack, paradigm and slots are empty and step 1 says why (Q5-A).
 */
export function emptyContent(language = ''): InflectionTableContent {
  const pack = packFor(language);
  const paradigm = pack?.paradigms[0];
  return {
    title: '',
    instruction: '',
    language,
    packId: pack?.id ?? '',
    packVersion: pack?.version ?? '',
    paradigmId: paradigm?.id ?? '',
    slots: paradigm ? paradigm.slots.map((s) => s.id) : [],
    rows: [],
    input: { ...DEFAULT_INPUT },
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** The pack the document was authored against, falling back to the course language's. */
export function packOf(ex: InflectionTableContent): ParadigmPack | null {
  return packById(ex.packId) ?? packFor(ex.language);
}

export function paradigmOf(ex: InflectionTableContent): Paradigm | null {
  const pack = packOf(ex);
  if (!pack) return null;
  return pack.paradigms.find((p) => p.id === ex.paradigmId) ?? null;
}

/** The slots in play, in the pack's order. A slot the pack no longer has is not among them. */
export function slotsInPlay(ex: InflectionTableContent): Slot[] {
  const paradigm = paradigmOf(ex);
  if (!paradigm) return [];
  return paradigm.slots.filter((s) => ex.slots.includes(s.id));
}

/** Slot ids the document keeps that its pack no longer has (DECISIONS §1, re-approval). */
export function slotsGone(ex: InflectionTableContent): string[] {
  const paradigm = paradigmOf(ex);
  if (!paradigm) return [];
  const known = new Set(paradigm.slots.map((s) => s.id));
  return ex.slots.filter((id) => !known.has(id));
}

/** Checks of the table — never unlimited for this type (step 4 slider 1–4). */
export function maxChecks(settings: Settings): number {
  return settings.attempts;
}
