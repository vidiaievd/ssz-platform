// The tokenizer for `highlight_in_text` — SPEC_data_model §2.
//
// A token is a run of letters or digits, optionally joined by a hyphen or an apostrophe
// (`e-post`, `don't`, `barn’s`). Everything else — spaces, punctuation, line breaks — sits
// between tokens and is never part of a span. A mark is a run of whole tokens; a half word
// or a lone comma cannot be marked, stored or graded (DECISIONS §1).
//
// **This is the only copy of the expression in the platform** (CLAUDE.md of the handoff,
// rule 5). The builder, the reader, the runner, the content-service preflight and the
// engine's grader all call this function from this file. A client that tokenized
// differently from the grader would produce keys off by one token — the one bug in this type
// that looks like a content error.
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
