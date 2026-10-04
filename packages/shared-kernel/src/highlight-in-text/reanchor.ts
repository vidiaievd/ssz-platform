// Re-anchoring — SPEC_data_model §4, DECISIONS §2. The `item_missing` trap of plan 63,
// surfaced instead of swallowed.
//
// Run once, when the author applies a text edit (never per keystroke). Two passes per span,
// decision Q7-A of plan 67:
//
//   1. **Shift.** The old and new texts share a prefix and a suffix; the edit is what lies
//      between. A span wholly inside the prefix keeps its offsets, one wholly inside the
//      suffix moves by the change in length. It lands there if the same words are on token
//      edges at the new place.
//   2. **Words and ordinal** (SPEC_data_model §4), for a span the edit touched or whose
//      shifted place no longer holds its words:
//        words   = the words it covered in the OLD text
//        ordinal = which run of those words it was, in the OLD text
//        runs    = every run of those words in the NEW text
//        none    → the span becomes an orphan, with its surface and its explanation
//        else    → it lands on runs[min(ordinal, runs.length - 1)]
//
// Why the first pass: the ordinal alone cannot keep a mark on «the same occurrence it was
// authored on» once another occurrence is inserted before it — the inserted word takes its
// number (AC-R2). The shift keeps it; the ordinal still handles the rewritten sentence the
// handoff designed it for. Matching is on lower-cased words and ignores the punctuation
// between them, so re-punctuating or re-capitalising a sentence never orphans a mark.
//
// `previewReanchor` is the same pass without committing — «See what moves» — so the count
// it reports is, by construction, the count applying would produce (AC-R5).

import { toCharRange, toTokenRun } from './coordinates.js';
import { runsOfWords } from './derive.js';
import type { HighlightInTextContent, Orphan, Span } from './model.js';
import type { Token } from './tokenize.js';
import { tokenize } from './tokenize.js';

export function reanchor(ex: HighlightInTextContent, newText: string): HighlightInTextContent {
  const oldTokens = tokenize(ex.text);
  const newTokens = tokenize(newText);
  const orphans: Orphan[] = [...ex.orphans];
  const edit = editRegion(ex.text, newText);

  const questions = ex.questions.map((q) => {
    const spans: Span[] = [];
    for (const span of q.spans) {
      const landed = shifted(edit, oldTokens, newTokens, span) ?? land(oldTokens, newTokens, span);
      if (landed) spans.push(landed);
      else orphans.push({ id: span.id, qid: q.id, surface: surfaceOf(ex.text, oldTokens, span), why: span.why });
    }
    spans.sort((a, b) => a.start - b.start || a.end - b.end);
    return { ...q, spans };
  });

  return { ...ex, text: newText, questions, orphans };
}

export interface ReanchorPreview {
  /** Marks that would lose their place — new orphans only, not the ones already waiting. */
  lost: number;
}

export function previewReanchor(ex: HighlightInTextContent, newText: string): ReanchorPreview {
  return { lost: reanchor(ex, newText).orphans.length - ex.orphans.length };
}

/** Whether the orphan's words exist anywhere in the current text — «Put it back» is offered. */
export function canPutBack(ex: HighlightInTextContent, orphan: Orphan): boolean {
  return firstRunOf(tokenize(ex.text), orphan.surface) !== null;
}

/**
 * Re-place an orphan on the first occurrence of its words, with its id and its explanation
 * (AC-R4). A no-op when the words are gone or the question no longer exists.
 */
export function putBack(ex: HighlightInTextContent, orphanId: string): HighlightInTextContent {
  const orphan = ex.orphans.find((o) => o.id === orphanId);
  if (!orphan || !ex.questions.some((q) => q.id === orphan.qid)) return ex;
  const tokens = tokenize(ex.text);
  const run = firstRunOf(tokens, orphan.surface);
  if (!run) return ex;

  const { start, end } = toCharRange(tokens, run);
  return {
    ...ex,
    orphans: ex.orphans.filter((o) => o.id !== orphanId),
    questions: ex.questions.map((q) =>
      q.id === orphan.qid
        ? {
            ...q,
            spans: [...q.spans, { id: orphan.id, start, end, why: orphan.why }].sort(
              (a, b) => a.start - b.start || a.end - b.end,
            ),
          }
        : q,
    ),
  };
}

export function dropOrphan(ex: HighlightInTextContent, orphanId: string): HighlightInTextContent {
  return { ...ex, orphans: ex.orphans.filter((o) => o.id !== orphanId) };
}

// ── internals ───────────────────────────────────────────────────────────────

/** The changed stretch of an edit: `[from, oldTo)` in the old text became `[from, newTo)`. */
interface EditRegion {
  from: number;
  oldTo: number;
  delta: number;
}

function editRegion(oldText: string, newText: string): EditRegion {
  let from = 0;
  const max = Math.min(oldText.length, newText.length);
  while (from < max && oldText[from] === newText[from]) from++;
  let suffix = 0;
  while (
    suffix < max - from &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }
  return { from, oldTo: oldText.length - suffix, delta: newText.length - oldText.length };
}

/** Pass 1 — the span outside the edit, moved with it, if its words are still there. */
function shifted(
  edit: EditRegion,
  oldTokens: readonly Token[],
  newTokens: readonly Token[],
  span: Span,
): Span | null {
  let start: number;
  if (span.end <= edit.from) start = span.start;
  else if (span.start >= edit.oldTo) start = span.start + edit.delta;
  else return null;
  const end = start + (span.end - span.start);

  // The edit may have glued letters onto the span's edge (`var` → `varm`); then it is not on
  // token edges any more and the second pass decides.
  if (!isOnEdges(newTokens, start, end)) return null;
  const oldRun = toTokenRun(oldTokens, span);
  const newRun = toTokenRun(newTokens, { start, end });
  if (!oldRun || !newRun) return null;
  const before = oldTokens.slice(oldRun.t0, oldRun.t1 + 1).map((t) => t.w.toLowerCase());
  const after = newTokens.slice(newRun.t0, newRun.t1 + 1).map((t) => t.w.toLowerCase());
  if (before.join(' ') !== after.join(' ')) return null;
  return { ...span, start, end };
}

function isOnEdges(tokens: readonly Token[], start: number, end: number): boolean {
  return tokens.some((t) => t.s === start) && tokens.some((t) => t.e === end);
}

function land(
  oldTokens: readonly Token[],
  newTokens: readonly Token[],
  span: Span,
): Span | null {
  const oldRun = toTokenRun(oldTokens, span);
  if (!oldRun) return null;
  const words = oldTokens.slice(oldRun.t0, oldRun.t1 + 1).map((t) => t.w.toLowerCase());

  const oldRuns = runsOfWords(oldTokens, words);
  const ordinal = Math.max(0, oldRuns.findIndex((r) => r.t0 === oldRun.t0));
  const runs = runsOfWords(newTokens, words);
  if (runs.length === 0) return null;

  const hit = runs[Math.min(ordinal, runs.length - 1)];
  if (!hit) return null;
  return { ...span, ...toCharRange(newTokens, hit) };
}

function surfaceOf(text: string, tokens: readonly Token[], span: Span): string {
  const run = toTokenRun(tokens, span);
  if (!run) return text.slice(span.start, span.end).trim();
  const { start, end } = toCharRange(tokens, run);
  return text.slice(start, end);
}

function firstRunOf(tokens: readonly Token[], phrase: string) {
  const words = tokenize(phrase).map((t) => t.w.toLowerCase());
  return runsOfWords(tokens, words)[0] ?? null;
}
