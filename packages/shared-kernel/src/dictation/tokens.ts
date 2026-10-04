// The words of a sentence, as the diff sees them — SPEC_data_model §2.
//
// Built on the platform's one tokenizer (`text/words.ts`, decision Q1-A of plan 68): a
// duplicated regex is the bug that looks like a content error. What this file adds is the
// punctuation: each token carries what stands between it and the next word (`p`), which the
// diff compares only when `marking.punctuation` is on.
//
// Whitespace is never significant (DECISIONS §2): runs collapse, leading and trailing space
// drops, a line break is a space. Inside `p` it is removed altogether — `,  «` and `,«` are the
// same punctuation.
//
// Both sides are put into NFC first (plan 68 §4.2, 7). A phone keyboard may hand over `å` as
// `a` + U+030A; without this the student's `å` and the key's `å` are different strings and
// the tokenizer splits the first one in two. Offsets are not needed here, so normalising
// costs nothing — unlike `highlight_in_text`, which keeps the author's text as typed.

import { tokenize } from '../text/words.js';

export interface DcToken {
  /** Position in the sentence, from 0 — what `FocusWord.wordIndex` points at. */
  i: number;
  /** The word as written. */
  w: string;
  /** The punctuation after it, whitespace removed. `''` when none. */
  p: string;
}

export function tokens(text: string): DcToken[] {
  const raw = (text ?? '').normalize('NFC');
  const words = tokenize(raw);
  return words.map((t, k) => {
    const next = words[k + 1];
    const tail = raw.slice(t.e, next === undefined ? raw.length : next.s);
    return { i: t.i, w: t.w, p: tail.replace(/\s+/g, '') };
  });
}

export function wordCount(text: string): number {
  return tokenize((text ?? '').normalize('NFC')).length;
}
