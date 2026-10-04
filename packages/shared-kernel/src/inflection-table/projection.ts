// What a student is allowed to see before answering (plan 69 §3.2).
//
// The rows (id, lemma, gloss), the slots in play with their headings, and per cell either the
// given form or the fact that it is asked — with the key's first letter when the author turned
// that hint on. No key, no variant, no reason, no dictionary link, no pass mark — ever (IT-M1,
// IT-X2). Four responsibilities beyond omission:
//
//   1. **Unready rows and ungradable cells never reach the student** (`readyRows`,
//      `gradedCells`); an asked cell without a key is left out rather than drawn empty.
//   2. **Slot headings are resolved here**, from the pack: VoxOrd carries no kernel, and a
//      heading is the pack's word, not the client's (plan 69 §3.2).
//   3. **The order is dealt here**, with a shuffle the server seeds per attempt — rows under
//      `shuffleRows`, the bank always. A runner that shuffled locally would shuffle what the
//      network tab had already shown in order.
//   4. **The bank is built here**: every key once plus the generated distractors (bank.ts) —
//      it is the one place keys legitimately reach the browser, as forms to pick from.

import { bankForms } from './bank.js';
import { firstLetter, gradedCells, readyRows } from './derive.js';
import type { InputMode, RevealKey } from './model.js';
import { paradigmOf, slotsInPlay } from './model.js';
import { fromPersisted } from './persistence.js';

export interface ProjectedSlot {
  id: string;
  label: string;
  short: string;
}

export type ProjectedCell = { mode: 'prefill'; value: string } | { mode: 'ask'; hint?: string };

export interface ProjectedRow {
  id: string;
  lemma: string;
  gloss: string;
  /** Keyed by slot id. A slot with no entry has nothing to draw. */
  cells: Record<string, ProjectedCell>;
}

/** The settings that change what the runner draws. The pass mark is not among them. */
export interface ProjectedSettings {
  input: InputMode;
  attempts: number;
  revealKey: RevealKey;
  rowVerdict: boolean;
}

export interface StudentProjection {
  instruction: string;
  /** The course language, so the runner can mark the reading font's language. */
  language: string;
  paradigm: { id: string; label: string; lemmaLabel: string };
  slots: ProjectedSlot[];
  rows: ProjectedRow[];
  /** Present only in bank mode. */
  bank?: string[];
  settings: ProjectedSettings;
}

/** Deterministic when nothing is injected; the server supplies the per-attempt seed. */
export type Shuffle = <T>(items: readonly T[]) => T[];

const identity: Shuffle = (items) => [...items];

export function toStudentProjection(
  content: unknown,
  expectedAnswers: unknown,
  shuffle: Shuffle = identity,
): StudentProjection {
  const ex = fromPersisted(content, expectedAnswers);
  const paradigm = paradigmOf(ex);
  const slots = slotsInPlay(ex);
  const asked = new Map(gradedCells(ex).map((c) => [c.key, c.cell]));
  const hint = ex.settings.hintFirstLetter;

  const rows = readyRows(ex).map((row): ProjectedRow => {
    const cells: Record<string, ProjectedCell> = {};
    for (const slot of slots) {
      const cell = row.cells[slot.id];
      if (!cell) continue;
      if (cell.mode === 'prefill') {
        cells[slot.id] = { mode: 'prefill', value: cell.value };
        continue;
      }
      const graded = asked.get(`${row.id}:${slot.id}`);
      if (!graded) continue;
      const letter = hint ? firstLetter(graded.value) : '';
      cells[slot.id] = letter === '' ? { mode: 'ask' } : { mode: 'ask', hint: letter };
    }
    return { id: row.id, lemma: row.lemma.trim(), gloss: row.gloss.trim(), cells };
  });

  const bank = ex.input.mode === 'bank' ? { bank: shuffle(bankForms(ex)) } : {};

  return {
    instruction: ex.instruction,
    language: ex.language,
    paradigm: {
      id: paradigm?.id ?? '',
      label: paradigm?.label ?? '',
      lemmaLabel: paradigm?.lemmaLabel ?? '',
    },
    slots: slots.map((s) => ({ id: s.id, label: s.label, short: s.short })),
    rows: ex.input.shuffleRows ? shuffle(rows) : rows,
    ...bank,
    settings: {
      input: ex.input.mode,
      attempts: ex.settings.attempts,
      revealKey: ex.settings.revealKey,
      rowVerdict: ex.settings.rowVerdict,
    },
  };
}

/**
 * The projection for a graded delivery (Q8-A of plan 67): one check, no first-letter hint and no
 * key in the verdict. The grader enforces the same through `check({ graded })`; this keeps the
 * screen from offering what the server will refuse.
 */
export function withGradedSettings(projection: unknown): unknown {
  if (typeof projection !== 'object' || projection === null || Array.isArray(projection))
    return projection;
  const record = projection as Record<string, unknown>;
  const settings = (
    typeof record['settings'] === 'object' && record['settings'] !== null ? record['settings'] : {}
  ) as Record<string, unknown>;
  const rows = Array.isArray(record['rows'])
    ? (record['rows'] as Array<Record<string, unknown>>).map((row) => ({
        ...row,
        cells: Object.fromEntries(
          Object.entries((row['cells'] ?? {}) as Record<string, ProjectedCell>).map(
            ([slotId, cell]) => [slotId, cell.mode === 'ask' ? { mode: 'ask' } : cell],
          ),
        ),
      }))
    : record['rows'];
  return { ...record, rows, settings: { ...settings, attempts: 1, revealKey: 'never' } };
}
