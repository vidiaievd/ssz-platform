// How an `inflection_table` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, language, pack id and version, paradigm, slots in
//                       play, input and settings; per row its id, lemma, gloss and dictionary
//                       link; per cell its mode, and the form only when the cell is *given*
//   expected_answers → per cell, by `rowId:slotId`: the form of an *asked* cell, its accepted
//                       variants and the author's reason
//
// The handoff's model comment: «cell.value / cell.accept / cell.why for asked cells live in
// expected_answers and never reach the browser before the verdict. Prefilled cells are content
// and do ship.» A given cell's reason and variants are kept on the key side too, so switching a
// cell to given and back does not lose what the author wrote.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown` and must not
// throw. It coerces and fills defaults, leaving issues.ts to report what is missing.

import type {
  Cell,
  CellMode,
  InflectionTableContent,
  InputSettings,
  RevealKey,
  Row,
  Settings,
} from './model.js';
import {
  cellKey,
  DEFAULT_INPUT,
  DEFAULT_SETTINGS,
  IT_MAX_ATTEMPTS,
  IT_MAX_BANK_EXTRA,
  IT_MIN_ATTEMPTS,
  IT_MIN_THRESHOLD,
  REVEAL_KEYS,
} from './model.js';

export const TEMPLATE_CODE = 'inflection_table';

/** A cell as `content` holds it: never the form of an asked cell. */
export type PersistedCell = { mode: 'prefill'; value: string } | { mode: 'ask' };

export interface PersistedRow {
  id: string;
  lemma: string;
  gloss: string;
  dictId: string | null;
  cells: Record<string, PersistedCell>;
}

/** The `content` column. Carries no key, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  language: string;
  packId: string;
  packVersion: string;
  paradigmId: string;
  slots: string[];
  rows: PersistedRow[];
  input: InputSettings;
  settings: Settings;
}

export interface PersistedKey {
  /** The form of an asked cell; absent for a given one (its form is in `content`). */
  value?: string;
  accept: string[];
  why: string;
}

/** The `expected_answers` column, keyed by `rowId:slotId` so reordering cannot shuffle it. */
export interface PersistedAnswers {
  cells: Record<string, PersistedKey>;
}

export function toContent(ex: InflectionTableContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    language: ex.language,
    packId: ex.packId,
    packVersion: ex.packVersion,
    paradigmId: ex.paradigmId,
    slots: [...ex.slots],
    // Unfinished rows are persisted as written — the teacher must be able to leave and come
    // back mid-table. The projection drops them.
    rows: ex.rows.map((r) => ({
      id: r.id,
      lemma: r.lemma,
      gloss: r.gloss,
      dictId: r.dictId,
      cells: Object.fromEntries(
        Object.entries(r.cells).map(([slotId, c]): [string, PersistedCell] => [
          slotId,
          c.mode === 'prefill' ? { mode: 'prefill', value: c.value } : { mode: 'ask' },
        ]),
      ),
    })),
    input: { ...ex.input },
    settings: { ...ex.settings },
  };
}

export function toExpectedAnswers(ex: InflectionTableContent): PersistedAnswers {
  const cells: PersistedAnswers['cells'] = {};
  for (const row of ex.rows) {
    for (const [slotId, c] of Object.entries(row.cells)) {
      const asked = c.mode === 'ask';
      if (!asked && c.accept.length === 0 && c.why === '') continue;
      cells[cellKey(row.id, slotId)] = {
        ...(asked ? { value: c.value } : {}),
        accept: [...c.accept],
        why: c.why,
      };
    }
  }
  return { cells };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): InflectionTableContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);

  const rows = persisted.rows.map((r): Row => ({
    id: r.id,
    lemma: r.lemma,
    gloss: r.gloss,
    dictId: r.dictId,
    cells: Object.fromEntries(
      Object.entries(r.cells).map(([slotId, c]): [string, Cell] => {
        const key = answers.cells[cellKey(r.id, slotId)];
        return [
          slotId,
          {
            mode: c.mode,
            value: c.mode === 'prefill' ? c.value : (key?.value ?? ''),
            accept: key?.accept ?? [],
            why: key?.why ?? '',
          },
        ];
      }),
    ),
  }));

  return { ...persisted, rows };
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    language: asString(record['language']),
    packId: asString(record['packId']),
    packVersion: asString(record['packVersion']),
    paradigmId: asString(record['paradigmId']),
    slots: asStrings(record['slots']),
    rows: readRows(record['rows']),
    input: readInput(record['input']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const cells: PersistedAnswers['cells'] = {};
  for (const [key, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['cells']))) {
    const record = asRecord(raw);
    const value = record['value'];
    cells[key] = {
      ...(typeof value === 'string' ? { value } : {}),
      accept: asStrings(record['accept']),
      why: asString(record['why']),
    };
  }
  return { cells };
}

// ── Coercion ────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v !== '')
    : [];
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

function readRows(value: unknown): PersistedRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const dictId = record['dictId'];
    const cells: Record<string, PersistedCell> = {};
    for (const [slotId, c] of Object.entries(asRecord(record['cells']))) {
      const cell = asRecord(c);
      const mode: CellMode = cell['mode'] === 'prefill' ? 'prefill' : 'ask';
      cells[slotId] = mode === 'prefill' ? { mode, value: asString(cell['value']) } : { mode };
    }
    return {
      id: asString(record['id']),
      lemma: asString(record['lemma']),
      gloss: asString(record['gloss']),
      dictId: typeof dictId === 'string' && dictId !== '' ? dictId : null,
      cells,
    };
  });
}

function readInput(value: unknown): InputSettings {
  const record = asRecord(value);
  return {
    mode: record['mode'] === 'bank' ? 'bank' : 'type',
    bankExtra: asNumber(record['bankExtra'], DEFAULT_INPUT.bankExtra, 0, IT_MAX_BANK_EXTRA),
    shuffleRows:
      typeof record['shuffleRows'] === 'boolean'
        ? record['shuffleRows']
        : DEFAULT_INPUT.shuffleRows,
  };
}

const isRevealKey = (value: unknown): value is RevealKey =>
  (REVEAL_KEYS as readonly unknown[]).includes(value);

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const bool = (key: keyof Settings, fallback: boolean): boolean =>
    typeof record[key] === 'boolean' ? (record[key] as boolean) : fallback;
  return {
    attempts: asNumber(
      record['attempts'],
      DEFAULT_SETTINGS.attempts,
      IT_MIN_ATTEMPTS,
      IT_MAX_ATTEMPTS,
    ),
    threshold: asNumber(record['threshold'], DEFAULT_SETTINGS.threshold, IT_MIN_THRESHOLD, 100),
    revealKey: isRevealKey(record['revealKey']) ? record['revealKey'] : DEFAULT_SETTINGS.revealKey,
    hintFirstLetter: bool('hintFirstLetter', DEFAULT_SETTINGS.hintFirstLetter),
    rowVerdict: bool('rowVerdict', DEFAULT_SETTINGS.rowVerdict),
  };
}
