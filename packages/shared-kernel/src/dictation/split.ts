// *Paste and split* — BEHAVIOR §3, AC-B2.
//
// The transcript is pasted once; sentence breaks become segments, and each segment's
// timecode is estimated from its share of the words. Estimates are a starting point, and the
// builder labels them as such until the author sets them — that label is session state and
// is not stored (plan 68 §4.2, 9): what is returned here says which segments were estimated.
//
// The sentence-ending characters come from the language pack (plan 68 §3.8). A pack without
// them — or no pack — splits on line breaks only.

import type { Segment } from './model.js';
import { newId } from './model.js';
import type { LanguagePack } from './presets.js';
import { wordCount } from './tokens.js';

function escapeClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&');
}

/** The sentences of a pasted text, trimmed, empty ones dropped. */
export function sentencesOf(text: string, pack: LanguagePack): string[] {
  const parts: string[] = [];
  for (const line of (text ?? '').split(/\n+/)) {
    if (pack.sentenceEnd === '') {
      parts.push(line);
      continue;
    }
    const end = new RegExp(`(?<=[${escapeClass(pack.sentenceEnd)}])\\s+`, 'u');
    parts.push(...line.split(end));
  }
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

export interface SplitResult {
  segments: Segment[];
  /** Ids of the segments whose timecode is an estimate — every one of them, when timed. */
  estimated: string[];
}

/**
 * One segment per sentence. With a known clip length each gets an estimated slice in
 * proportion to its words; without one, no timecodes at all.
 */
export function splitTranscript(text: string, duration: number, pack: LanguagePack): SplitResult {
  const sentences = sentencesOf(text, pack);
  const counts = sentences.map(wordCount);
  const words = counts.reduce((n, c) => n + c, 0) || 1;
  const timed = duration > 0;

  let t = 0;
  const segments = sentences.map((sentence, k): Segment => {
    const share = ((counts[k] ?? 0) / words) * duration;
    const seg: Segment = {
      id: newId(),
      text: sentence,
      audio: timed ? { start: Math.round(t), end: Math.round(t + share) } : null,
      why: '',
      focus: [],
    };
    t += share;
    return seg;
  });
  return { segments, estimated: timed ? segments.map((s) => s.id) : [] };
}
