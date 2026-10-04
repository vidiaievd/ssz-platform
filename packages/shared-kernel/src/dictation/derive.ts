// Everything computed from the draft rather than stored (CLAUDE.md of the handoff, rule 6):
// which segments are ready, word counts, focus coverage, timing, the evidence ceiling.

import type { DictationContent, FocusWord, Segment } from './model.js';
import { wordCount } from './tokens.js';

/** Segments with something written — the only ones a student is ever given. */
export function readySegments(ex: DictationContent): Segment[] {
  return ex.segments.filter((s) => s.text.trim() !== '');
}

/** Words across the whole key. */
export function allWords(ex: DictationContent): number {
  return ex.segments.reduce((n, s) => n + wordCount(s.text), 0);
}

/** Focus words that carry a reason, out of all of them — the step-3 meter. */
export function focusCoverage(ex: DictationContent): { total: number; written: number } {
  let total = 0;
  let written = 0;
  for (const s of ex.segments) {
    for (const f of s.focus) {
      total++;
      if (f.why.trim() !== '') written++;
    }
  }
  return { total, written };
}

/** Whether a segment has a usable slice of the clip. */
export function isTimed(seg: Segment): boolean {
  return seg.audio !== null && seg.audio.end > seg.audio.start;
}

export function timedCount(ex: DictationContent): number {
  return ex.segments.filter(isTimed).length;
}

/** The focus word on this token of the segment, if any. */
export function focusAt(seg: Segment, wordIndex: number): FocusWord | null {
  return seg.focus.find((f) => f.wordIndex === wordIndex) ?? null;
}

/**
 * What lowers the evidence ceiling — SPEC_data_model §7, plan 68 §3.7. One rule, read by the
 * engine (`evidenceLowered`) and by the line under the step-4 axes. `transcript` is any policy
 * other than «after» or «never» — today only «always», which is also a blocker.
 */
export type CeilingCause = 'count' | 'transcript' | 'both';

export function ceilingCause(ex: DictationContent): CeilingCause | null {
  const count = ex.settings.showWordCount;
  const policy = ex.audio.settings.transcriptWhen;
  const transcript = policy !== 'after' && policy !== 'never';
  if (count && transcript) return 'both';
  if (count) return 'count';
  if (transcript) return 'transcript';
  return null;
}
