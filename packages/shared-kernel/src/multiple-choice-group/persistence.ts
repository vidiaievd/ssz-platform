// How a `multiple_choice_group` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, settings, the columns, the source (in `link`
//                       mode, or `inline` where the passage is the student's to read), and
//                       per row: its id and its text
//   expected_answers → per row: which column is the key, the author's line, and the quote
//                       that proves it
//
// This is deviation 1 of plan 54 §5. IMPLEMENTATION.md §Storage puts the whole model in one
// JSON payload; the platform has two columns and the second exists precisely so the answer
// does not travel. `row.answer` is the whole answer to this exercise, so it lives on the key
// side and the content column carries no trace of it.
//
// `quote` goes with the key and not with the content, which is less obvious and more
// important. On a Riktig/Galt row the quote is the line of the passage that proves the
// statement — that is, the answer written out in the author's own words. A projection that
// shipped the quotes would hand over the key row by row while withholding the column ids.
//
// `fromPersisted` is the boundary: what comes out of a JSON column is `unknown`, may
// predate the current shape, and must not throw. It coerces and fills defaults, leaving
// issues.ts to report what is actually missing.
//
// ── Two families under one template code ────────────────────────────────────
// Plan 54 §1.2: the old form (`content.items[]` with `expected_answers.items[]`) stays
// readable while the two seeded exercises are rewritten.
// `isMultipleChoiceGroupDocument` is how every dispatching surface — the validator, the
// runners, the projection, the content preview — tells the two apart. It asks for `rows`
// being an array and nothing else: an old document has no such field, and a new one always
// does, even while empty.

import type {
  Column,
  Layout,
  MultipleChoiceGroupContent,
  RetryPolicy,
  Row,
  Settings,
  ShowWhy,
  Source,
  SourceMode,
} from './model.js';
import { DEFAULT_SETTINGS, shortFor } from './model.js';

export const TEMPLATE_CODE = 'multiple_choice_group';

/** One row as the `content` column holds it — the statement, never its column. */
export interface PersistedRow {
  id: string;
  text: string;
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  source: Source;
  columns: Column[];
  rows: PersistedRow[];
  settings: Settings;
}

/** One row's key. */
export interface PersistedKey {
  answer: string | null;
  why: string;
  quote: string;
}

/** The `expected_answers` column. Keyed by row id, so reordering cannot shuffle it. */
export interface PersistedAnswers {
  rows: Record<string, PersistedKey>;
}

export function toContent(ex: MultipleChoiceGroupContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    source: { ...ex.source },
    columns: ex.columns.map((c) => ({ ...c })),
    // Empty rows are persisted as authored — the teacher must be able to leave and come
    // back mid-write. They are dropped in the projection instead.
    rows: ex.rows.map((r) => ({ id: r.id, text: r.text })),
    settings: { ...ex.settings },
  };
}

export function toExpectedAnswers(ex: MultipleChoiceGroupContent): PersistedAnswers {
  const rows: PersistedAnswers['rows'] = {};
  for (const r of ex.rows) rows[r.id] = { answer: r.answer, why: r.why, quote: r.quote };
  return { rows };
}

export function fromPersisted(
  content: unknown,
  expectedAnswers: unknown,
): MultipleChoiceGroupContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    source: persisted.source,
    columns: persisted.columns,
    settings: persisted.settings,
    rows: persisted.rows.map((r): Row => {
      const key = answers.rows[r.id];
      return {
        id: r.id,
        text: r.text,
        answer: key?.answer ?? null,
        why: key?.why ?? '',
        quote: key?.quote ?? '',
      };
    }),
  };
}

/**
 * Is this a document of the new form?
 *
 * Deliberately structural rather than a version field: the two documents of the old form
 * were written before any version existed, so a field could only ever be absent there —
 * which is the same test, spelled less honestly.
 */
export function isMultipleChoiceGroupDocument(content: unknown): boolean {
  return Array.isArray(asRecord(content)['rows']);
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    source: readSource(record['source']),
    columns: readColumns(record['columns']),
    rows: readRows(record['rows']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const rows: PersistedAnswers['rows'] = {};
  for (const [id, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['rows']))) {
    const record = asRecord(raw);
    const answer = record['answer'];
    rows[id] = {
      answer: typeof answer === 'string' && answer !== '' ? answer : null,
      why: asString(record['why']),
      quote: asString(record['quote']),
    };
  }
  return { rows };
}

// ── Coercion ────────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

const isMode = (value: unknown): value is SourceMode =>
  value === 'none' || value === 'inline' || value === 'link';

const isRetry = (value: unknown): value is RetryPolicy =>
  value === 'none' || value === 'one' || value === 'unlimited';

const isLayout = (value: unknown): value is Layout => value === 'auto' || value === 'cards';

const isShowWhy = (value: unknown): value is ShowWhy =>
  value === 'never' || value === 'wrong' || value === 'always';

function readSource(value: unknown): Source {
  const record = asRecord(value);
  const mode = record['mode'];
  const lessonId = record['lessonId'];
  return {
    mode: isMode(mode) ? mode : 'none',
    label: asString(record['label']),
    text: asString(record['text']),
    ...(typeof lessonId === 'string' && lessonId !== '' ? { lessonId } : {}),
  };
}

function readColumns(value: unknown): Column[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const label = asString(record['label']);
    const short = asString(record['short']);
    return { id: asString(record['id']), label, short: short !== '' ? short : shortFor(label) };
  });
}

function readRows(value: unknown): PersistedRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return { id: asString(record['id']), text: asString(record['text']) };
  });
}

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const retry = record['retry'];
  const layout = record['layout'];
  const showWhy = record['showWhy'];
  const threshold = record['passThreshold'];

  return {
    numbering: asBoolean(record['numbering'], DEFAULT_SETTINGS.numbering),
    shuffleRows: asBoolean(record['shuffleRows'], DEFAULT_SETTINGS.shuffleRows),
    layout: isLayout(layout) ? layout : DEFAULT_SETTINGS.layout,
    showText: asBoolean(record['showText'], DEFAULT_SETTINGS.showText),
    retry: isRetry(retry) ? retry : DEFAULT_SETTINGS.retry,
    lockCorrect: asBoolean(record['lockCorrect'], DEFAULT_SETTINGS.lockCorrect),
    showWhy: isShowWhy(showWhy) ? showWhy : DEFAULT_SETTINGS.showWhy,
    revealKey: asBoolean(record['revealKey'], DEFAULT_SETTINGS.revealKey),
    // Clamped rather than defaulted: a threshold outside 0-100 is a bad number, not a
    // missing one, and silently restoring 70 would hide it from the author.
    passThreshold:
      typeof threshold === 'number' && Number.isFinite(threshold)
        ? Math.min(100, Math.max(0, Math.round(threshold)))
        : DEFAULT_SETTINGS.passThreshold,
    progress: asBoolean(record['progress'], DEFAULT_SETTINGS.progress),
  };
}
