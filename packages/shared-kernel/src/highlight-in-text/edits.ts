// Edits — pure reducers over the document. The builder wraps each in its own state update;
// every cascade the handoff names lives here once, so step 2 and a test exercise the same
// code (BEHAVIOR §3, DECISIONS §1).
//
// Marks are passed in as token indices — what the canvas knows — and stored as character
// offsets (coordinates.ts). Nothing here re-anchors: a text edit goes through `applyText`,
// which is `reanchor` under the name the builder calls it by.

import { clampToParagraph, paragraphOfTokens, toCharRange, toTokenRun } from './coordinates.js';
import type { HighlightInTextContent, Question, Settings, Span, Unit } from './model.js';
import { HT_MAX_Q, newId, newQuestion } from './model.js';
import { reanchor } from './reanchor.js';
import { tokenize } from './tokenize.js';

export { dropOrphan, putBack } from './reanchor.js';

type Patch<T> = Partial<T>;

export function update(
  ex: HighlightInTextContent,
  patch: Patch<Pick<HighlightInTextContent, 'title' | 'instruction'>>,
): HighlightInTextContent {
  return { ...ex, ...patch };
}

export function updateSettings(ex: HighlightInTextContent, patch: Patch<Settings>): HighlightInTextContent {
  return { ...ex, settings: { ...ex.settings, ...patch } };
}

/** Commit a new passage and re-anchor every mark to it. Orphans appear in step 2. */
export function applyText(ex: HighlightInTextContent, newText: string): HighlightInTextContent {
  return reanchor(ex, newText);
}

// ── questions ───────────────────────────────────────────────────────────────

export function canAddQuestion(ex: HighlightInTextContent): boolean {
  return ex.questions.length < HT_MAX_Q;
}

/** Appends an empty question; a no-op at the ceiling of four (AC-A3). */
export function addQuestion(ex: HighlightInTextContent): HighlightInTextContent {
  if (!canAddQuestion(ex)) return ex;
  return { ...ex, questions: [...ex.questions, newQuestion()] };
}

/** Removes a question with its marks **and its orphans** — none may point at nothing (AC-A6). */
export function removeQuestion(ex: HighlightInTextContent, qid: string): HighlightInTextContent {
  return {
    ...ex,
    questions: ex.questions.filter((q) => q.id !== qid),
    orphans: ex.orphans.filter((o) => o.qid !== qid),
  };
}

/**
 * Prompt, hints and unit. Switching to `word` **never** truncates a phrase mark already
 * there — it is a warning (`HT_UNIT_MISMATCH`), not a silent edit (DECISIONS §1).
 */
export function updateQuestion(
  ex: HighlightInTextContent,
  qid: string,
  patch: Patch<Pick<Question, 'prompt' | 'unit' | 'missHint' | 'fpHint'>>,
): HighlightInTextContent {
  return withQuestion(ex, qid, (q) => ({ ...q, ...patch }));
}

export function setUnit(ex: HighlightInTextContent, qid: string, unit: Unit): HighlightInTextContent {
  return updateQuestion(ex, qid, { unit });
}

// ── marks ───────────────────────────────────────────────────────────────────

export interface MarkEdit {
  ex: HighlightInTextContent;
  /** The span created by this edit, for the canvas to outline; `null` when one was removed. */
  added: string | null;
}

/**
 * A click or a drag on the canvas (BEHAVIOR §3).
 *
 *   * `origin` is where the press happened, `end` where it was released;
 *   * `unit: word` — only the origin counts: a drag cannot make anything longer (AC-M3);
 *   * the run is cut at the origin's paragraph;
 *   * a click on a marked token removes the whole span it belongs to;
 *   * a run over existing marks replaces them with one mark over the run.
 */
export function toggleMark(ex: HighlightInTextContent, qid: string, origin: number, end: number): MarkEdit {
  const q = ex.questions.find((x) => x.id === qid);
  const tokens = tokenize(ex.text);
  if (!q || !tokens[origin]) return { ex, added: null };

  const reach = q.unit === 'word' || !tokens[end] ? origin : end;
  const run = clampToParagraph(paragraphOfTokens(ex.text, tokens), origin, reach);
  const runs = q.spans.map((s) => ({ s, r: toTokenRun(tokens, s) }));

  if (run.t0 === run.t1) {
    const hit = runs.find(({ r }) => r !== null && r.t0 <= run.t0 && run.t0 <= r.t1);
    if (hit) return { ex: withQuestion(ex, qid, () => ({ ...q, spans: q.spans.filter((s) => s.id !== hit.s.id) })), added: null };
  }

  const kept = runs.filter(({ r }) => r === null || r.t1 < run.t0 || r.t0 > run.t1).map(({ s }) => s);
  const span: Span = { id: newId(), ...toCharRange(tokens, run), why: '' };
  return { ex: withQuestion(ex, qid, () => ({ ...q, spans: sortSpans([...kept, span]) })), added: span.id };
}

/**
 * Shift+→ / Shift+← on a marked token in a `phrase` question — grow or shrink the mark at
 * its far end by one token (BEHAVIOR §3, keyboard). It never shrinks below one token, never
 * crosses its paragraph and never runs into another mark of the same question. A no-op on a
 * `word` question.
 */
export function resizeMark(
  ex: HighlightInTextContent,
  qid: string,
  spanId: string,
  delta: 1 | -1,
): HighlightInTextContent {
  const q = ex.questions.find((x) => x.id === qid);
  if (!q || q.unit !== 'phrase') return ex;
  const tokens = tokenize(ex.text);
  const span = q.spans.find((s) => s.id === spanId);
  const run = span ? toTokenRun(tokens, span) : null;
  if (!span || !run) return ex;

  const t1 = run.t1 + delta;
  if (t1 < run.t0 || !tokens[t1]) return ex;
  const paragraphOf = paragraphOfTokens(ex.text, tokens);
  if (paragraphOf[t1] !== paragraphOf[run.t0]) return ex;
  const taken = q.spans.some((s) => {
    if (s.id === spanId) return false;
    const r = toTokenRun(tokens, s);
    return r !== null && r.t0 <= t1 && t1 <= r.t1;
  });
  if (taken) return ex;

  const next = { ...span, ...toCharRange(tokens, { t0: run.t0, t1 }) };
  return withQuestion(ex, qid, (x) => ({ ...x, spans: sortSpans(x.spans.map((s) => (s.id === spanId ? next : s))) }));
}

export function removeSpan(ex: HighlightInTextContent, qid: string, spanId: string): HighlightInTextContent {
  return withQuestion(ex, qid, (q) => ({ ...q, spans: q.spans.filter((s) => s.id !== spanId) }));
}

export function clearMarks(ex: HighlightInTextContent, qid: string): HighlightInTextContent {
  return withQuestion(ex, qid, (q) => ({ ...q, spans: [] }));
}

export function setSpanWhy(
  ex: HighlightInTextContent,
  qid: string,
  spanId: string,
  why: string,
): HighlightInTextContent {
  return withQuestion(ex, qid, (q) => ({
    ...q,
    spans: q.spans.map((s) => (s.id === spanId ? { ...s, why } : s)),
  }));
}

// ── internals ───────────────────────────────────────────────────────────────

function withQuestion(
  ex: HighlightInTextContent,
  qid: string,
  fn: (q: Question) => Question,
): HighlightInTextContent {
  return { ...ex, questions: ex.questions.map((q) => (q.id === qid ? fn(q) : q)) };
}

function sortSpans(spans: Span[]): Span[] {
  return [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
}
