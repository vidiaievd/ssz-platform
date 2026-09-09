// What can be derived from a document without knowing anything else about it.
//
// `readyRows` is the one to be careful with. IMPLEMENTATION.md, "Things that will bite
// you": it is the *only* gate on what a student sees — rows without text or without a key
// are dropped silently at runtime, and a runner that rendered `ex.rows` directly would put
// half-written statements in front of a student. Every other surface (the projection, the
// grader, the coverage strip, the balance bar) asks this same function rather than
// re-deriving the rule.

import type { Column, MultipleChoiceGroupContent, Row } from './model.js';

/** Column lookup by id, or `null`. */
export function column(ex: MultipleChoiceGroupContent, id: string | null): Column | null {
  if (id === null) return null;
  return ex.columns.find((c) => c.id === id) ?? null;
}

/** Whether the row's key points at a column that still exists. */
export function isAnswered(ex: MultipleChoiceGroupContent, row: Row): boolean {
  return column(ex, row.answer) !== null;
}

/** The rows a student may be shown: written *and* answered, in author order. */
export function readyRows(ex: MultipleChoiceGroupContent): Row[] {
  return ex.rows.filter((r) => r.text.trim() !== '' && isAnswered(ex, r));
}

/** Rows with text, whether or not they carry a key — what the audit reads. */
export function writtenRows(ex: MultipleChoiceGroupContent): Row[] {
  return ex.rows.filter((r) => r.text.trim() !== '');
}

export interface ColumnCount {
  column: Column;
  n: number;
}

/**
 * How the answers spread over the columns — README calls it "the failure mode of this
 * exercise type", and it is: a Riktig/Galt table where nine of ten rows are «Riktig» is
 * passed by a student who never read the text.
 */
export interface Balance {
  counts: ColumnCount[];
  total: number;
  /** The share held by the most-used column, 0..1. `0` when nothing is ready. */
  topShare: number;
  /** The most-used column, or `null` when nothing is ready. */
  top: Column | null;
  /** Columns no ready row is answered with. */
  unused: Column[];
}

export function balance(ex: MultipleChoiceGroupContent): Balance {
  const ready = readyRows(ex);
  const counts: ColumnCount[] = ex.columns.map((c) => ({
    column: c,
    n: ready.filter((r) => r.answer === c.id).length,
  }));
  const total = ready.length;
  const top = counts.reduce<ColumnCount | null>((a, b) => (a === null || b.n > a.n ? b : a), null);

  return {
    counts,
    total,
    topShare: total > 0 && top !== null ? top.n / total : 0,
    top: total > 0 ? (top?.column ?? null) : null,
    unused: counts.filter((c) => c.n === 0).map((c) => c.column),
  };
}

/** The numbers behind the step-4 coverage strip — README `mgCoverage`. */
export interface Coverage {
  /** Ready rows; nothing else can be explained, because nothing else is shown. */
  total: number;
  /** How many have an explanation written. */
  written: number;
  /** How many point at a line in the passage. */
  quoted: number;
  /** `total - written`. */
  missing: number;
}

export function coverage(ex: MultipleChoiceGroupContent): Coverage {
  const ready = readyRows(ex);
  const written = ready.filter((r) => r.why.trim() !== '').length;
  const quoted = ready.filter((r) => r.quote.trim() !== '').length;
  return { total: ready.length, written, quoted, missing: ready.length - written };
}

/**
 * Whether a row's quote is actually in the passage.
 *
 * IMPLEMENTATION.md is explicit that this must not reject on save — a teacher may edit the
 * text after writing the quotes, and losing the quote would be worse than showing a stale
 * one. So this reports, and `issues` raises it at `warning` level at most.
 *
 * Whitespace is collapsed on both sides: a quote pasted out of a wrapped paragraph carries
 * the line breaks with it, and failing on that would flag every correctly-quoted row.
 */
export function quoteFound(source: string, quote: string): boolean {
  const needle = collapse(quote);
  if (needle === '') return true;
  return collapse(source).includes(needle);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Mark one row's answer, or clear it.
 *
 * Lives here rather than in the builder for the reason `setKey` does in `multiple_choice`:
 * "one answer per row" is a rule of the model, not of the editor. IMPLEMENTATION.md,
 * "Things that will bite you": the single answer is enforced in the setter, not in the
 * shape — there is no array here, and if one were introduced the audit, the balance and
 * the whole scoring layer would change meaning.
 *
 * Passing the column the row already holds clears it, which is BEHAVIOR S2.4: clicking the
 * checked radio unmarks it.
 */
export function setAnswer(row: Row, columnId: string): Row {
  return { ...row, answer: row.answer === columnId ? null : columnId };
}
