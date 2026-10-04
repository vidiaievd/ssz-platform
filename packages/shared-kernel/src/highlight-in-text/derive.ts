// Derived values — SPEC_data_model §3. Pure, and nothing here is ever stored (CLAUDE.md of
// the handoff, rule 6): density, coverage, readiness and the ceiling are recomputed from the
// document every time they are read.

import type { TokenRun } from './coordinates.js';
import { toCharRange, toTokenRun } from './coordinates.js';
import type { HighlightInTextContent, Question, Span } from './model.js';
import type { Token } from './tokenize.js';
import { tokenize } from './tokenize.js';

/** A span together with the tokens it covers in the current text. */
export interface SpanRun extends TokenRun {
  span: Span;
}

export function tokensOf(ex: HighlightInTextContent): Token[] {
  return tokenize(ex.text);
}

export function wordCount(ex: HighlightInTextContent): number {
  return tokensOf(ex).length;
}

/** The text a run covers, punctuation between its tokens included — `htSurface`. */
export function surface(text: string, tokens: readonly Token[], run: TokenRun): string {
  const { start, end } = toCharRange(tokens, run);
  return text.slice(start, end);
}

/**
 * Every run in `tokens` whose words equal `words` (lower-cased) — the re-anchoring
 * primitive, `htRuns`. Punctuation between the tokens is not compared.
 */
export function runsOfWords(tokens: readonly Token[], words: readonly string[]): TokenRun[] {
  const out: TokenRun[] = [];
  if (words.length === 0) return out;
  for (let i = 0; i + words.length <= tokens.length; i++) {
    let ok = true;
    for (let k = 0; k < words.length; k++) {
      if (tokens[i + k]?.w.toLowerCase() !== words[k]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ t0: i, t1: i + words.length - 1 });
  }
  return out;
}

/**
 * A question's spans as token runs, in text order. A span that touches no token in the
 * current text is left out — it cannot be drawn or graded; `issues` reports it.
 */
export function spanRuns(tokens: readonly Token[], question: Question): SpanRun[] {
  const out: SpanRun[] = [];
  for (const span of question.spans) {
    const run = toTokenRun(tokens, span);
    if (run) out.push({ span, ...run });
  }
  return out.sort((a, b) => a.t0 - b.t0);
}

/** Span id → its number as the author and the student see it: order in the text, from 1. */
export function spanOrdinals(question: Question): Map<string, number> {
  const sorted = [...question.spans].sort((a, b) => a.start - b.start || a.end - b.end);
  return new Map(sorted.map((s, i) => [s.id, i + 1]));
}

/** Tokens under the question's marks. */
export function markedWords(tokens: readonly Token[], question: Question): number {
  return spanRuns(tokens, question).reduce((n, r) => n + (r.t1 - r.t0 + 1), 0);
}

/** Share of the passage the question claims, 0..1. */
export function density(ex: HighlightInTextContent, question: Question): number {
  const tokens = tokensOf(ex);
  return tokens.length === 0 ? 0 : markedWords(tokens, question) / tokens.length;
}

/** Two spans of one question share a character — `HT_SPANS_OVERLAP`. */
export function overlaps(question: Question): boolean {
  const sorted = [...question.spans].sort((a, b) => a.start - b.start);
  return sorted.some((s, i) => i > 0 && s.start < (sorted[i - 1]?.end ?? 0));
}

export interface Coverage {
  /** Spans with a written `why`. */
  written: number;
  total: number;
}

export function coverage(ex: HighlightInTextContent): Coverage {
  let total = 0;
  let written = 0;
  for (const q of ex.questions) {
    for (const s of q.spans) {
      total++;
      if (s.why.trim() !== '') written++;
    }
  }
  return { written, total };
}

/**
 * Questions with a prompt and at least one span — the only ones a student is shown.
 * `htReady`. The one filter between the document and the projection.
 */
export function readyQuestions(ex: HighlightInTextContent): Question[] {
  return ex.questions.filter((q) => q.prompt.trim() !== '' && q.spans.length > 0);
}

/**
 * Why the engine lowers this exercise's evidence ceiling, or `null` when it does not —
 * the one rule both the engine and step 4 read (plan 67 §3.6; precedent: plan 66).
 *
 *   count   — «Det er N å finne» turns the tail into counting (DECISIONS §5);
 *   penalty — with no cost for an extra mark, marking everything passes (DECISIONS §4).
 */
export type CeilingCause = 'count' | 'penalty' | 'both';

export function ceilingCause(ex: HighlightInTextContent): CeilingCause | null {
  const count = ex.settings.showCount;
  const penalty = ex.settings.penalty === 'off';
  if (count && penalty) return 'both';
  if (count) return 'count';
  if (penalty) return 'penalty';
  return null;
}

/** Lower-cased, inner whitespace collapsed — for comparing prompts. */
export function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}
