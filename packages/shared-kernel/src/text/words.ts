// The word tokenizer — SPEC_data_model §2 of both `highlight_in_text` and `dictation`.
//
// A token is a run of letters or digits, optionally joined by a hyphen or an apostrophe
// (`e-post`, `don't`, `barn’s`). Everything else — spaces, punctuation, line breaks — sits
// between tokens. In `highlight_in_text` a mark is a run of whole tokens; in `dictation` a
// token is the unit the word diff aligns, with the punctuation after it carried alongside.
//
// **This is the only copy of the expression in the platform** (rule 5 of both handoffs).
// It started in `highlight-in-text/` (plan 67) and moved here when `dictation` needed the
// same words (plan 68, decision Q1-A); `highlight-in-text/tokenize.ts` re-exports it. A client
// that tokenized differently from the grader would produce keys off by one token — the one
// bug in either type that looks like a content error.
//
// Nothing in the expression is Norwegian. A language pack may bring another tokenizer later;
// `TOKENIZER_ID` names this one so a document can say which it was authored against.
//
// Known limit, accepted: the expression matches code points, not grapheme clusters. A text
// in decomposed form (`a` + U+030A instead of `å`) splits at the combining mark. Texts typed
// or pasted in a browser arrive composed; normalising here would move every offset after the
// first such character and is not done.

export const TOKENIZER_ID = 'unicode-word-v1';

const WORD = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export interface Token {
  /** Position in the passage, from 0. */
  i: number;
  /** The word as written. */
  w: string;
  /** Character offset of its first character in the text. */
  s: number;
  /** Character offset one past its last character. */
  e: number;
}

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of (text ?? '').matchAll(WORD)) {
    out.push({ i: out.length, w: m[0], s: m.index, e: m.index + m[0].length });
  }
  return out;
}

/**
 * The words of a string, lower-cased — what re-anchoring compares.
 *
 * Case-insensitive on purpose (SPEC_data_model §4): capitalising the first word of a
 * sentence the author moved must not orphan the mark on it.
 */
export function wordsOf(text: string): string[] {
  return tokenize(text).map((t) => t.w.toLowerCase());
}
