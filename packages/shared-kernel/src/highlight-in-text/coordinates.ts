// Character offsets ↔ token runs — the one conversion between how a mark is stored and how
// it is worked on (SPEC_data_model §1).
//
// Storage and the wire speak character offsets into the passage (`{start, end}`); the editor,
// the renderer and the grader speak token indices (`{t0, t1}`, inclusive). Every place that
// needs one from the other calls this file, so the two cannot disagree about where a word
// begins.
//
// A run never crosses a paragraph (out of scope of the handoff: "marking across paragraph
// boundaries"). Whoever builds one — a drag in the editor, a drag in the runner, a mark the
// server snaps — cuts it at the paragraph its first token is in.

import { splitParagraphsWithOffsets } from '../text/paragraphs.js';
import type { Token } from './tokenize.js';
import { tokenize } from './tokenize.js';

/** Inclusive token indices. */
export interface TokenRun {
  t0: number;
  t1: number;
}

/** Character offsets into the passage, `end` exclusive. */
export interface CharRange {
  start: number;
  end: number;
}

/**
 * The run of tokens a character range touches, or `null` when it touches none.
 *
 * "Touches" is overlap, not containment: a range that cuts a word in half takes the whole
 * word. That is what snapping means for a student's mark (SPEC_api_contract §3) and it is
 * harmless for a stored span, which already starts and ends on token edges.
 */
export function toTokenRun(tokens: readonly Token[], range: CharRange): TokenRun | null {
  // Also refuses NaN and inverted ranges: whatever the wire carried, nothing is under it.
  if (!(range.end > range.start)) return null;
  let t0 = -1;
  let t1 = -1;
  for (const t of tokens) {
    if (t.e <= range.start) continue;
    if (t.s >= range.end) break;
    if (t0 === -1) t0 = t.i;
    t1 = t.i;
  }
  return t0 === -1 ? null : { t0, t1 };
}

/** The characters a run covers: first token's start to last token's end. */
export function toCharRange(tokens: readonly Token[], run: TokenRun): CharRange {
  const first = tokens[run.t0];
  const last = tokens[run.t1];
  if (!first || !last) return { start: 0, end: 0 };
  return { start: first.s, end: last.e };
}

/** Whether a stored range sits exactly on token edges — the preflight's `HT_SPAN_OFF_TOKENS`. */
export function isOnTokens(tokens: readonly Token[], range: CharRange): boolean {
  if (!(range.end > range.start)) return false;
  return tokens.some((t) => t.s === range.start) && tokens.some((t) => t.e === range.end);
}

/**
 * For each token, the index of the paragraph it is in.
 *
 * A token is always inside a paragraph: paragraphs are the text minus blank-line separators
 * and edge whitespace, and a token is never whitespace.
 */
export function paragraphOfTokens(text: string, tokens: readonly Token[]): number[] {
  const paragraphs = splitParagraphsWithOffsets(text);
  const out: number[] = [];
  let p = 0;
  for (const t of tokens) {
    while (p < paragraphs.length - 1 && t.s >= (paragraphs[p]?.bodyEnd ?? 0)) p++;
    out.push(p);
  }
  return out;
}

/**
 * Cut a run at the paragraph its **origin** is in.
 *
 * The origin is where a drag started — it may be either end of the run. Whatever lies past
 * the paragraph edge on the far side is dropped.
 */
export function clampToParagraph(
  paragraphOf: readonly number[],
  origin: number,
  other: number,
): TokenRun {
  const p = paragraphOf[origin];
  let t0 = Math.min(origin, other);
  let t1 = Math.max(origin, other);
  while (t0 < origin && paragraphOf[t0] !== p) t0++;
  while (t1 > origin && paragraphOf[t1] !== p) t1--;
  return { t0, t1 };
}

/**
 * Merge runs that share a token — AC-G6. Touching runs (`t1 + 1 === t0`) stay apart: two
 * adjacent marks are two answers, not one.
 */
export function mergeRuns(runs: readonly TokenRun[]): TokenRun[] {
  const sorted = [...runs].sort((a, b) => a.t0 - b.t0 || a.t1 - b.t1);
  const out: TokenRun[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.t0 <= last.t1) last.t1 = Math.max(last.t1, r.t1);
    else out.push({ ...r });
  }
  return out;
}

export type SnapResult =
  | { ok: true; runs: TokenRun[] }
  /** `index` — the first mark that covers no token. */
  | { ok: false; code: 'HT_MARK_UNSNAPPABLE'; index: number };

/**
 * The student's marks as the grader reads them — SPEC_api_contract §3.
 *
 * Each mark is snapped to the tokens it touches, cut at the paragraph of its first token,
 * and overlapping marks are merged. A mark covering no token refuses the whole submission
 * (AC-G7): it is the signature of a client tokenizing differently, and grading the rest
 * would score an answer the student did not give.
 */
export function snapMarks(text: string, marks: readonly CharRange[]): SnapResult {
  const tokens = tokenize(text);
  const paragraphOf = paragraphOfTokens(text, tokens);
  const runs: TokenRun[] = [];
  for (const [index, mark] of marks.entries()) {
    const run = toTokenRun(tokens, mark);
    if (!run) return { ok: false, code: 'HT_MARK_UNSNAPPABLE', index };
    runs.push(clampToParagraph(paragraphOf, run.t0, run.t1));
  }
  return { ok: true, runs: mergeRuns(runs) };
}
