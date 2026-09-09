// Grading one sentence: what the student put on the board against what the key says.
//
// Source: `ssGrade` / `ssSolution` in the handoff's data.jsx; the case table is
// BEHAVIOR.md, "Student · checking".
//
// Runs on the server for real verdicts (plan 52 §3.2 — the key never reaches a browser)
// and in the builder's preview, where the author has the key anyway. Pure and synchronous
// in both.

import type { Chunk, Field, OrderMode, Row, Settings } from './model.js';
import { ORDER_FIELD_ID } from './model.js';

/** Where every item currently sits: fieldId → placed item ids, in the order placed. */
export type Placement = Record<string, string[]>;

/**
 * Why one placed item is wrong, or that it is right.
 *
 * - `field` — a chunk of this sentence, in a field the key does not accept.
 * - `order`  — right field, but behind a chunk that comes later in the sentence.
 * - `extra`  — not a chunk of this sentence at all: a distractor, or a leftover id.
 */
export type ItemMark = 'ok' | 'field' | 'order' | 'extra';

/**
 * How a whole field reads.
 *
 * `empty` is not a pass and not a failure — it is *unmarked*. A field that should stay
 * empty and did gets no colour at all, because colouring it would turn the mark into a
 * hint for the fields next to it.
 */
export type FieldMark = 'ok' | 'bad' | 'empty';

export interface GradeResult {
  byItem: Record<string, ItemMark>;
  byField: Record<string, FieldMark>;
  /** Wrong items plus required fields left empty. `0` with everything placed = solved. */
  wrong: number;
  /** Every chunk of the row is on the board and every mark is `ok`. */
  solved: boolean;
  /** Chunks placed / chunks in the row — the `Sjekk (n/total)` counter. */
  placed: number;
  total: number;
}

/**
 * Grade a placement against a row.
 *
 * Walks each field in the order the student stacked it. The one subtle rule, and the
 * reason `loose` is a one-flag change: **order is judged against the chunk's index in the
 * sentence, never against the field's own list** (IMPLEMENTATION.md). A chunk is out of
 * order when a chunk that comes later in the sentence was already accepted above it.
 */
export function grade(row: Row, fields: Field[], placement: Placement, settings: Settings): GradeResult {
  const chunkById = new Map<string, Chunk>(row.chunks.map((c) => [c.id, c]));
  const indexById = new Map<string, number>(row.chunks.map((c, i) => [c.id, i]));

  const byItem: Record<string, ItemMark> = {};
  const fieldHasWrong: Record<string, boolean> = {};

  // First pass: every item, in the order the student stacked it.
  for (const field of fields) {
    const placed = placement[field.id] ?? [];
    let highestAccepted = -1;
    let anyWrong = false;

    for (const itemId of placed) {
      const chunk = chunkById.get(itemId);
      let mark: ItemMark;
      if (!chunk) {
        mark = 'extra';
      } else if (!settings.orderOnly && chunk.field !== field.id && !chunk.alt.includes(field.id)) {
        // Sequence-only makes no claim about which field a piece belongs to, so there is
        // no such thing as the wrong one. A distractor is still `extra`: it is not a
        // chunk of the sentence at all, which is a different statement.
        mark = 'field';
      } else if (
        (settings.orderOnly || settings.order === 'strict') &&
        (indexById.get(itemId) ?? 0) < highestAccepted
      ) {
        // `loose` is meaningless here — order is the only thing being asked — so the mode
        // grades strictly whatever the flag says, rather than accepting every board.
        mark = 'order';
      } else {
        mark = 'ok';
        highestAccepted = Math.max(highestAccepted, indexById.get(itemId) ?? 0);
      }
      byItem[itemId] = mark;
      if (mark !== 'ok') anyWrong = true;
    }
    fieldHasWrong[field.id] = anyWrong;
  }

  // Second pass: the fields, which can only be judged once every item has been.
  //
  // "Empty although the key expects something" has to be asked *after* the whole board is
  // marked, because a chunk accepted in one of its alternative fields legitimately leaves
  // its own field empty. Asking per field, in isolation, marks a correct board wrong —
  // which is exactly what the first version of this function did.
  const acceptedIds = new Set(Object.entries(byItem).filter(([, m]) => m === 'ok').map(([id]) => id));
  const byField: Record<string, FieldMark> = {};
  let missingFields = 0;

  for (const field of fields) {
    const placed = placement[field.id] ?? [];
    const awaited =
      placed.length === 0 &&
      (settings.orderOnly
        ? row.chunks.some((c) => !acceptedIds.has(c.id))
        : row.chunks.some((c) => c.field === field.id && !acceptedIds.has(c.id)));
    if (awaited) missingFields += 1;
    byField[field.id] =
      fieldHasWrong[field.id] || awaited ? 'bad' : placed.length > 0 ? 'ok' : 'empty';
  }

  const wrongItems = Object.values(byItem).filter((m) => m !== 'ok').length;
  const placedIds = new Set(fields.flatMap((f) => placement[f.id] ?? []));
  const placedChunks = row.chunks.filter((c) => placedIds.has(c.id)).length;

  return {
    byItem,
    byField,
    wrong: wrongItems + missingFields,
    solved: wrongItems + missingFields === 0 && placedChunks === row.chunks.length && row.chunks.length > 0,
    placed: placedChunks,
    total: row.chunks.length,
  };
}

/**
 * How many chunks the key puts in this field.
 *
 * Counts a chunk whose own field is this one. Alternatives are deliberately not counted:
 * `counts` shows the student the expected size of a field, and an alternative would make
 * two fields both claim the same piece, so the numbers would not add up to the sentence.
 */
export function expectedIn(row: Row, fieldId: string): number {
  return row.chunks.filter((c) => c.field === fieldId).length;
}

/** The board as the key has it — what `Vis riktig skjema` fills in. */
export function solution(row: Row, orderOnly = false): Placement {
  // One slot, the sentence in its own order: the key of a sequence-only row is the row.
  if (orderOnly) return { [ORDER_FIELD_ID]: row.chunks.map((c) => c.id) };

  const out: Placement = {};
  for (const chunk of row.chunks) {
    if (chunk.field === null) continue;
    (out[chunk.field] ??= []).push(chunk.id);
  }
  return out;
}

/**
 * The board a student starts from.
 *
 * `prefill: 'first'` places the row's first chunk; `'none'` starts empty. The handoff has
 * no arbitrary pre-fill and neither do we (plan 52 Q4) — `prefilled[]` of the old schema
 * was declared for eighteen months and used by none of the seven exercises.
 */
export function initialPlacement(
  row: Row,
  prefill: Settings['prefill'],
  orderOnly = false,
): Placement {
  if (prefill !== 'first') return {};
  const first = row.chunks[0];
  if (!first) return {};
  if (orderOnly) return { [ORDER_FIELD_ID]: [first.id] };
  if (first.field === null) return {};
  return { [first.field]: [first.id] };
}

/**
 * What `Rett opp` leaves on the board: the correct items, nothing else.
 *
 * Keeping the right answers is the whole point — retyping work already judged correct
 * teaches nothing and reads as punishment.
 */
export function keepCorrect(placement: Placement, marks: GradeResult): Placement {
  const out: Placement = {};
  for (const [fieldId, items] of Object.entries(placement)) {
    const kept = items.filter((id) => marks.byItem[id] === 'ok');
    if (kept.length > 0) out[fieldId] = kept;
  }
  return out;
}

/**
 * Score for one row, as a percentage of its fields.
 *
 * The handoff says the type reports attempts, not a grade. On this platform every type
 * carries a score and SRS and progress are built on it (plan 52 §3.4), so it is computed
 * here — from fields, the same unit the old validator used, so a converted exercise does
 * not silently change what a percentage means.
 *
 * Only fields the key has an opinion about count: a field that should be empty and is
 * empty is neither earned nor missed.
 */
export function scoreRow(row: Row, fields: Field[], marks: GradeResult, orderOnly = false): number {
  // One slot would make every sequence-only sentence all-or-nothing, which is not what a
  // percentage is for here: getting six of seven pieces in order is most of the way, and
  // the SRS reads this number.
  if (orderOnly) {
    if (row.chunks.length === 0) return 100;
    const right = row.chunks.filter((c) => marks.byItem[c.id] === 'ok').length;
    return Math.round((100 * right) / row.chunks.length);
  }

  const judged = fields.filter((f) => marks.byField[f.id] !== 'empty' || expectedIn(row, f.id) > 0);
  if (judged.length === 0) return 100;
  const ok = judged.filter((f) => marks.byField[f.id] === 'ok').length;
  return Math.round((100 * ok) / judged.length);
}

/** `strict` unless the exercise says otherwise — mirrors the default, for callers with none. */
export const DEFAULT_ORDER: OrderMode = 'strict';
