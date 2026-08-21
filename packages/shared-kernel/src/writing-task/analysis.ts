// The text-analysis engine for `writing_task` — README "The analysis engine ... port
// verbatim", ported from the handoff's `wt/data.jsx` with one change: `analyse` reads a
// mark suggestion from `Criterion.metric` instead of the prototype's rubric-position
// switch (`model.ts`'s `CriterionMetric`, plan 50 decision 3). A reordered or custom
// rubric therefore never gets a nonsense suggestion — a criterion with `metric: null`
// simply gets none.
//
// Nothing here grades a student. It measures the *measurable* parts of a text — word
// count, paragraph breaks, which must-cover points were phrased, lexical variety — so
// that (a) a teacher can sanity-check their own task, (b) the student gets a factual
// readout, and (c) a future AI pre-check has a deterministic base. A human still sets
// every mark; see model.ts's header and IMPLEMENTATION.md's "Rules".
//
// Pure and synchronous by design (IMPLEMENTATION.md): this runs on every keystroke in
// the builder's step-3 tester, in the review queue and in the runner's readout bar.

import type { Criterion, Point, WritingTaskContent } from './model.js';

const STRIP = /[«»"'.,;:!?()\-–—]/g;

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text.toLowerCase().replace(STRIP, ' ').replace(/\s+/g, ' ').trim();
}

/** `normalize`d text, split on spaces, empties dropped. */
export function words(text: string): string[] {
  const normalized = normalize(text);
  return normalized === '' ? [] : normalized.split(' ');
}

/** Split on blank lines, trimmed, empties dropped — the paragraph count. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}

/** Whether the phrase's words appear as a contiguous run in `haystack`. */
export function hasPhrase(haystack: readonly string[], phrase: string): boolean {
  const needle = words(phrase);
  if (needle.length === 0) return false;

  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/** Points with non-empty text — half-written points never count. */
export function usablePoints(content: Pick<WritingTaskContent, 'points'>): Point[] {
  return content.points.filter((p) => p.text.trim() !== '');
}

export type TextLength = 'empty' | 'short' | 'ok' | 'long';

export interface PointCoverage {
  id: string;
  text: string;
  required: boolean;
  /** Any keyword matched as a contiguous phrase. */
  hit: boolean;
}

export interface Analysis {
  words: number;
  paragraphs: number;
  uniqueWords: number;
  /** Type/token ratio — the lexical-variation proxy. */
  ratio: number;
  cover: PointCoverage[];
  /** Required points that were hit. */
  hitCount: number;
  /** Required points total. */
  neededCount: number;
  length: TextLength;
  /** Suggested 0-3 mark per criterion id. Absent for a criterion with `metric: null`. */
  suggested: Record<string, 0 | 1 | 2 | 3>;
  /** `Σ (suggested[id] ?? 0) × weight` — see the module header for why a missing
   *  suggestion contributes 0 rather than making the total undefined. */
  total: number;
}

export function analyse(
  ex: Pick<WritingTaskContent, 'points' | 'rubric' | 'settings'>,
  text: string,
): Analysis {
  const wordList = words(text);
  const paraList = paragraphs(text);
  const uniqueWords = new Set(wordList).size;

  const cover: PointCoverage[] = usablePoints(ex).map((p) => ({
    id: p.id,
    text: p.text,
    required: p.required,
    hit: p.keywords.some((k) => k.trim() !== '' && hasPhrase(wordList, k)),
  }));
  const needed = cover.filter((c) => c.required);
  const hitCount = needed.filter((c) => c.hit).length;

  const length: TextLength =
    wordList.length === 0
      ? 'empty'
      : wordList.length < ex.settings.minWords
        ? 'short'
        : ex.settings.maxWords > 0 && wordList.length > ex.settings.maxWords
          ? 'long'
          : 'ok';

  const ratio = wordList.length > 0 ? uniqueWords / wordList.length : 0;

  const suggested: Record<string, 0 | 1 | 2 | 3> = {};
  for (const criterion of ex.rubric) {
    const mark = suggestMark(criterion.metric, { needed: needed.length, hit: hitCount, paragraphs: paraList.length, words: wordList.length, length, ratio });
    if (mark !== undefined) suggested[criterion.id] = mark;
  }

  const total = ex.rubric.reduce((sum, c) => sum + (suggested[c.id] ?? 0) * c.weight, 0);

  return {
    words: wordList.length,
    paragraphs: paraList.length,
    uniqueWords,
    ratio,
    cover,
    hitCount,
    neededCount: needed.length,
    length,
    suggested,
    total,
  };
}

function suggestMark(
  metric: Criterion['metric'],
  facts: { needed: number; hit: number; paragraphs: number; words: number; length: TextLength; ratio: number },
): (0 | 1 | 2 | 3) | undefined {
  switch (metric) {
    case 'points':
      if (facts.needed === 0) return 2;
      if (facts.hit === facts.needed) return 3;
      if (facts.hit >= facts.needed - 1) return 2;
      return facts.hit > 0 ? 1 : 0;
    case 'paragraphs':
      if (facts.paragraphs >= 3) return 3;
      if (facts.paragraphs === 2) return 2;
      return facts.words > 60 ? 1 : 0;
    case 'language':
      // The honest placeholder: grammar is not measurable without a model (README).
      return facts.length === 'empty' ? 0 : 2;
    case 'lexis':
      if (facts.ratio > 0.62) return 3;
      if (facts.ratio > 0.5) return 2;
      return facts.ratio > 0.38 ? 1 : 0;
    case null:
      return undefined;
  }
}

/** `Σ 3 × weight` over the rubric — the maximum possible score. */
export function rubricMax(ex: Pick<WritingTaskContent, 'rubric'>): number {
  return ex.rubric.reduce((sum, c) => sum + 3 * c.weight, 0);
}

/** `Σ mark × weight` over a set of marks keyed by criterion id. */
export function rubricScore(
  ex: Pick<WritingTaskContent, 'rubric'>,
  marks: Record<string, number | null | undefined>,
): number {
  return ex.rubric.reduce((sum, c) => sum + (marks[c.id] ?? 0) * c.weight, 0);
}
