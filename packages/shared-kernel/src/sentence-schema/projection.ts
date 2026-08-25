// What a student is allowed to receive, and what comes back with the verdict.
//
// README, Security: "grading must also run server-side. `chunk.field`, `chunk.alt`,
// `row.fb` and `row.why` are the answer key — strip them from the student payload and
// return marks from `POST /attempts`." Plan 52 §3.2 adds `row.text` to that list: it is
// the word order written out, and the runner never renders it.
//
// The `content` column already excludes all of it (persistence.ts), so this module is not
// the only line of defence — it is the one that also *arranges* what is left: the bank is
// assembled and shuffled here, server-side, because a bank in sentence order would hand
// over the answer just as surely as the key would.
//
// One projection rule that looks like an omission and is not: an undeliverable row is
// dropped rather than sent half-built. A row with an unplaced chunk cannot be graded, and
// a student cannot be asked to solve a sentence whose key does not exist yet.

import { initialPlacement, type Placement } from './grading.js';
import type { Chunk, ClauseId, Field, Row, SentenceSchemaContent, Settings } from './model.js';
import { fieldsFor, isDeliverable } from './model.js';

/** One piece of the bank, as the student sees it: a text and an id, nothing else. */
export interface ProjectedItem {
  id: string;
  text: string;
}

export interface ProjectedRow {
  id: string;
  clause: ClauseId;
  fields: Field[];
  /** Chunks and, when `settings.extras` is on, the distractors — already shuffled. */
  bank: ProjectedItem[];
  /** The sentence to rewrite, for a transformation task. `''` for a plain layout. */
  source: string;
  /** Chunks expected per field, when `settings.counts` is on. Absent otherwise. */
  counts: Record<string, number> | null;
  /** The board the student starts from, per `settings.prefill`. */
  start: Placement;
}

export interface StudentProjection {
  title: string;
  instruction: string;
  rows: ProjectedRow[];
  settings: Settings;
}

/** Deterministic when `shuffle` is off; otherwise the caller supplies the randomness. */
export type Shuffle = <T>(items: T[]) => T[];

const identity: Shuffle = (items) => items;

/**
 * Project the whole document for one student.
 *
 * `shuffle` is injected rather than called from here so the server can seed it per attempt
 * and the builder preview can reshuffle on demand — and so this function stays pure and
 * testable, which a `Math.random` inside would not be.
 */
export function toStudentProjection(
  ex: SentenceSchemaContent,
  shuffle: Shuffle = identity,
): StudentProjection {
  const rows = ex.rows.filter(isDeliverable).map((row): ProjectedRow => {
    const fields = fieldsFor(ex, row);
    const items: ProjectedItem[] = [
      ...row.chunks.map((c) => ({ id: c.id, text: c.text })),
      ...(ex.settings.extras ? row.extras.map((e) => ({ id: e.id, text: e.text })) : []),
    ];
    return {
      id: row.id,
      clause: row.clause,
      fields,
      bank: ex.settings.shuffle ? shuffle(items) : items,
      source: row.source,
      counts: ex.settings.counts ? countsFor(row, fields) : null,
      start: initialPlacement(row, ex.settings.prefill),
    };
  });

  return { title: ex.title, instruction: ex.instruction, rows, settings: ex.settings };
}

/**
 * Expected chunks per field.
 *
 * Only computed when `settings.counts` is on, and that is a real leak boundary rather than
 * a rendering nicety: the numbers are a partial key — with them, a one-chunk field with a
 * count of one is solved by elimination — so the author's decision to show them has to be
 * enforced where the payload is built, not where it is drawn.
 */
function countsFor(row: Row, fields: Field[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const field of fields) {
    out[field.id] = row.chunks.filter((c) => c.field === field.id).length;
  }
  return out;
}

/** What comes back after a check: the marks, and the key only once the row is closed. */
export interface StudentResult {
  rowId: string;
  attempt: number;
  byItem: Record<string, 'ok' | 'field' | 'order' | 'extra'>;
  /** Absent when `settings.perField` is off — the sentence is marked as a whole. */
  byField: Record<string, 'ok' | 'bad' | 'empty'> | null;
  wrong: number;
  solved: boolean;
  score: number;
  /** The rule. Present on success or on reveal; withheld while the row is still open. */
  why: string | null;
  /** The sentence in its correct order. Same rule as `why`. */
  text: string | null;
  /** The full solution, on reveal only. */
  solution: Placement | null;
}

/**
 * Whether the key may travel with this result.
 *
 * Solved or revealed = the row is closed and the answer is no longer worth withholding;
 * a wrong attempt with retries left keeps it back, because `Rett opp` only means something
 * while the answer is still unknown.
 */
export function keyIsDue(solved: boolean, revealed: boolean): boolean {
  return solved || revealed;
}

/** The chunk texts of a row, for callers that need the bank without the whole projection. */
export function bankOf(row: Row, settings: Settings): ProjectedItem[] {
  const chunks: Chunk[] = row.chunks;
  return [
    ...chunks.map((c) => ({ id: c.id, text: c.text })),
    ...(settings.extras ? row.extras.map((e) => ({ id: e.id, text: e.text })) : []),
  ];
}
