// How a `sentence_schema` document maps onto the platform's storage.
//
// The exercise row splits the document across two JSON columns:
//
//   content          → title, instruction, presetId, clauses, schema, settings, and per
//                      row: id, clause, source, chunk ids and texts, extras
//   expected_answers → per row: text, why, per-chunk field + alt, per-chunk fb
//
// The split is the security boundary (plan 52 §3.2). `chunk.field` and `chunk.alt` are the
// answer; `why` and `fb` explain it; and `text` is the sentence **in the correct order**,
// which is the answer written out as a string. The handoff's Security section lists the
// first four and omits `text` — verified against the prototype, whose runner never renders
// it, so keeping it on the key side costs nothing and closes the hole.
//
// Chunk *texts* stay on the content side: they are the word bank, which the student must
// see. What is withheld is where each one goes.
//
// ── Two families under one template code ────────────────────────────────────
// Plan 52 §8 Q3: only the first lesson of Norsk B1 is reseeded, so six exercises of the
// old form (`sentence` / `fields` / `tokens` / `placements`, snake_case) stay live.
// `isSentenceSchemaDocument` is how every dispatching surface — the validator, both
// runners, the content preview — tells the two apart. It asks whether `rows` is an array:
// an old document has no such field, a new one always does, even while empty.

import {
  CLAUSE_IDS,
  DEFAULT_SETTINGS,
  type Chunk,
  type ClauseId,
  type Extra,
  type Field,
  type OrderMode,
  type PrefillMode,
  type Row,
  type Schema,
  type SentenceSchemaContent,
  type Settings,
} from './model.js';

export const TEMPLATE_CODE = 'sentence_schema';

/** One chunk as the `content` column holds it — the piece, never its field. */
export interface PersistedChunk {
  id: string;
  text: string;
}

/** One row as the `content` column holds it. */
export interface PersistedRow {
  id: string;
  clause: ClauseId;
  /** The prompt sentence of a transformation task, or `''` (plan 52 §3.8). */
  source: string;
  chunks: PersistedChunk[];
  extras: Extra[];
}

/** The `content` column. Carries no answer, by construction. */
export interface PersistedContent {
  title: string;
  instruction: string;
  presetId: string;
  clauses: ClauseId[];
  schema: Schema;
  rows: PersistedRow[];
  settings: Settings;
}

/** One row's key. */
export interface PersistedKey {
  /** The sentence in the correct order. Answer-bearing — see the header. */
  text: string;
  why: string;
  /** chunkId → the field it belongs in. */
  fields: Record<string, string | null>;
  /** chunkId → other fields also accepted. */
  alt: Record<string, string[]>;
  /** chunkId → explanation override. */
  fb: Record<string, string>;
}

/** The `expected_answers` column. Keyed by row id, so reordering cannot shuffle it. */
export interface PersistedAnswers {
  rows: Record<string, PersistedKey>;
}

export function toContent(ex: SentenceSchemaContent): PersistedContent {
  return {
    title: ex.title,
    instruction: ex.instruction,
    presetId: ex.presetId,
    clauses: ex.clauses,
    schema: ex.schema,
    rows: ex.rows.map((row) => ({
      id: row.id,
      clause: row.clause,
      source: row.source,
      chunks: row.chunks.map((c) => ({ id: c.id, text: c.text })),
      extras: row.extras,
    })),
    settings: ex.settings,
  };
}

export function toExpectedAnswers(ex: SentenceSchemaContent): PersistedAnswers {
  const rows: PersistedAnswers['rows'] = {};
  for (const row of ex.rows) {
    const fields: Record<string, string | null> = {};
    const alt: Record<string, string[]> = {};
    for (const chunk of row.chunks) {
      fields[chunk.id] = chunk.field;
      if (chunk.alt.length > 0) alt[chunk.id] = chunk.alt;
    }
    rows[row.id] = { text: row.text, why: row.why, fields, alt, fb: row.fb };
  }
  return { rows };
}

export function fromPersisted(content: unknown, expectedAnswers: unknown): SentenceSchemaContent {
  const persisted = readContent(content);
  const answers = readAnswers(expectedAnswers);

  return {
    title: persisted.title,
    instruction: persisted.instruction,
    presetId: persisted.presetId,
    clauses: persisted.clauses,
    schema: persisted.schema,
    settings: persisted.settings,
    rows: persisted.rows.map((row): Row => {
      const key = answers.rows[row.id];
      return {
        id: row.id,
        clause: row.clause,
        source: row.source,
        // A row whose key is missing reads as an unplaced row, not as an empty sentence:
        // the pieces are still there, so the builder shows the work rather than a blank.
        text: key?.text ?? row.chunks.map((c) => c.text).join(' '),
        chunks: row.chunks.map(
          (c): Chunk => ({
            id: c.id,
            text: c.text,
            field: key?.fields[c.id] ?? null,
            alt: key?.alt[c.id] ?? [],
          }),
        ),
        extras: row.extras,
        why: key?.why ?? '',
        fb: key?.fb ?? {},
      };
    }),
  };
}

/**
 * Is this a document of the new form?
 *
 * Structural rather than a version field, for the same reason as `short_answer`: the six
 * documents of the old form were written before any version existed, so a field could
 * only ever be absent there — the same test, spelled less honestly.
 */
export function isSentenceSchemaDocument(content: unknown): boolean {
  return Array.isArray(asRecord(content)['rows']);
}

/** Read the `content` column on its own — all the runner ever gets to see. */
export function readContent(content: unknown): PersistedContent {
  const record = asRecord(content);
  return {
    title: asString(record['title']),
    instruction: asString(record['instruction']),
    presetId: asString(record['presetId'], 'blank'),
    clauses: readClauses(record['clauses']),
    schema: readSchema(record['schema']),
    rows: readRows(record['rows']),
    settings: readSettings(record['settings']),
  };
}

export function readAnswers(expectedAnswers: unknown): PersistedAnswers {
  const rows: PersistedAnswers['rows'] = {};
  for (const [id, raw] of Object.entries(asRecord(asRecord(expectedAnswers)['rows']))) {
    const record = asRecord(raw);
    rows[id] = {
      text: asString(record['text']),
      why: asString(record['why']),
      fields: readFieldMap(record['fields']),
      alt: readAltMap(record['alt']),
      fb: readStringMap(record['fb']),
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

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

const isClause = (value: unknown): value is ClauseId =>
  typeof value === 'string' && (CLAUSE_IDS as readonly string[]).includes(value);

function readClauses(value: unknown): ClauseId[] {
  const found = Array.isArray(value) ? value.filter(isClause) : [];
  // Order is the chip order of step 1, not the order a document happens to list them in.
  return CLAUSE_IDS.filter((c) => found.includes(c));
}

function readSchema(value: unknown): Schema {
  const record = asRecord(value);
  return CLAUSE_IDS.reduce((acc, clause) => {
    acc[clause] = readFields(record[clause]);
    return acc;
  }, {} as Record<ClauseId, Field[]>);
}

function readFields(value: unknown): Field[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return {
      id: asString(record['id']),
      short: asString(record['short']),
      label: asString(record['label']),
      hint: asString(record['hint']),
      optional: asBoolean(record['optional'], false),
    };
  });
}

function readRows(value: unknown): PersistedRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    const clause = record['clause'];
    return {
      id: asString(record['id']),
      clause: isClause(clause) ? clause : 'main',
      source: asString(record['source']),
      chunks: readChunks(record['chunks']),
      extras: readExtras(record['extras']),
    };
  });
}

function readChunks(value: unknown): PersistedChunk[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return { id: asString(record['id']), text: asString(record['text']) };
  });
}

function readExtras(value: unknown): Extra[] {
  if (!Array.isArray(value)) return [];
  return value.map((raw) => {
    const record = asRecord(raw);
    return { id: asString(record['id']), text: asString(record['text']) };
  });
}

function readFieldMap(value: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const [id, raw] of Object.entries(asRecord(value))) {
    out[id] = typeof raw === 'string' ? raw : null;
  }
  return out;
}

function readAltMap(value: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [id, raw] of Object.entries(asRecord(value))) out[id] = readStringArray(raw);
  return out;
}

function readStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, raw] of Object.entries(asRecord(value))) {
    if (typeof raw === 'string') out[id] = raw;
  }
  return out;
}

const ORDER_MODES: readonly OrderMode[] = ['strict', 'loose'];
const PREFILL_MODES: readonly PrefillMode[] = ['none', 'first'];

function readSettings(value: unknown): Settings {
  const record = asRecord(value);
  const order = record['order'];
  const prefill = record['prefill'];
  return {
    labels: asBoolean(record['labels'], DEFAULT_SETTINGS.labels),
    hints: asBoolean(record['hints'], DEFAULT_SETTINGS.hints),
    counts: asBoolean(record['counts'], DEFAULT_SETTINGS.counts),
    prefill:
      typeof prefill === 'string' && (PREFILL_MODES as readonly string[]).includes(prefill)
        ? (prefill as PrefillMode)
        : DEFAULT_SETTINGS.prefill,
    markEmpty: asBoolean(record['markEmpty'], DEFAULT_SETTINGS.markEmpty),
    perField: asBoolean(record['perField'], DEFAULT_SETTINGS.perField),
    hintAfterMistake: asBoolean(record['hintAfterMistake'], DEFAULT_SETTINGS.hintAfterMistake),
    shuffle: asBoolean(record['shuffle'], DEFAULT_SETTINGS.shuffle),
    extras: asBoolean(record['extras'], DEFAULT_SETTINGS.extras),
    order:
      typeof order === 'string' && (ORDER_MODES as readonly string[]).includes(order)
        ? (order as OrderMode)
        : DEFAULT_SETTINGS.order,
  };
}
