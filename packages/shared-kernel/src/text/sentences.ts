// Sentence split of a passage by its tokens (plan 86, step 6d, §4i.2).
//
// The pronunciation drill takes one sentence at a time, but the layers keep their anchors as
// token numbers of the **whole** passage (`tokenize`, `unicode-word-v1`). So a sentence here is
// a run of whole tokens, `[first, end)`, plus the character range it was read from — nothing is
// renumbered, and a layer anchored to the passage needs no translation to be shown by sentence.
//
// What ends a sentence: `. ! ? …` (with the quotes and brackets that close it) and a line
// break. A full stop does not end one after an abbreviation or a number when the next thing on
// the line is not a capital: *bl.a. annet*, *f.eks. i dag*, *den 1. mai*. After a capital it
// does — *… som osv. Han kom* is two sentences. Nothing is language-specific except the
// abbreviation list, which is Norwegian; another language brings its own.

import { tokenize, type Token } from './words.js';

export interface Sentence {
  /** Position in the passage, from 0; sentences without a word are dropped before numbering. */
  index: number;
  /** Character offset of the first character and one past the last, terminator included. */
  s: number;
  e: number;
  /** The tokens of the sentence: `[first, end)` in `tokenize(text)`. */
  first: number;
  end: number;
}

/** Dotted words and short forms that are followed by a full stop without ending the sentence. */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  'bl.a',
  'f.eks',
  'o.l',
  'm.m',
  'm.fl',
  'd.v.s',
  'dvs',
  'osv',
  'ca',
  'kl',
  'nr',
  'mm',
  'jf',
  'evt',
  'bl',
  'pga',
  'ifm',
  'mfl',
  'ol',
  'o.a',
  'ev',
  'dr',
  'prof',
  'hr',
  'fru',
  'st',
  'tlf',
  'cm',
  'kr',
  'mill',
  'mrd',
  'sml',
  'jr',
  'sr',
]);

const CLOSERS = /["'»”’)\]]/;
const TERMINATORS = new Set(['.', '!', '?', '…']);

/** The dotted run of letters, digits and dots that ends right before the dot at `at`. */
function dottedWordBefore(text: string, at: number): string {
  let k = at;
  while (k > 0 && /[\p{L}\p{N}.]/u.test(text[k - 1]!)) k--;
  return text.slice(k, at).replace(/^\.+/, '');
}

function nextVisible(text: string, from: number): string | null {
  for (let k = from; k < text.length; k++) {
    if (!/\s/u.test(text[k]!)) return text[k]!;
  }
  return null;
}

/** Whether the full stop at `at` is the end of a sentence. */
function stopEnds(text: string, at: number): boolean {
  const after = text[at + 1];
  // A dot inside a word or a number (*bl.a*, *3.5*, *e-post.no*) is not an end.
  if (after !== undefined && !/[\s"'»”’)\]…!?.]/u.test(after)) return false;
  const word = dottedWordBefore(text, at);
  const next = nextVisible(text, at + 1);
  if (next === null) return true;
  const soft = ABBREVIATIONS.has(word.toLowerCase()) || /^\d+$/.test(word);
  if (!soft) return true;
  return next !== next.toLowerCase() && next === next.toUpperCase() && /\p{L}/u.test(next);
}

/**
 * The sentences of a passage. `tokens` is `tokenize(text)` when the caller has it already.
 * Every token belongs to exactly one sentence; a text without a word has none.
 */
export function splitSentences(text: string, tokens: readonly Token[] = tokenize(text)): Sentence[] {
  const out: Sentence[] = [];
  let from = 0;
  let cursor = 0;

  const close = (to: number) => {
    const first = cursor;
    let end = first;
    while (end < tokens.length && tokens[end]!.s < to) end++;
    if (end > first) {
      let s = from;
      while (s < to && /\s/u.test(text[s]!)) s++;
      out.push({ index: out.length, s, e: to, first, end });
      cursor = end;
    }
    from = to;
  };

  let k = 0;
  while (k < text.length) {
    const ch = text[k]!;
    if (ch === '\n') {
      close(k);
      k++;
      from = k;
      continue;
    }
    if (TERMINATORS.has(ch)) {
      // A run of terminators (*?!*, *...*) and what closes the sentence after it is one end.
      let last = k;
      while (last + 1 < text.length && TERMINATORS.has(text[last + 1]!)) last++;
      const ends = ch === '.' && last === k ? stopEnds(text, k) : true;
      if (ends) {
        let to = last + 1;
        while (to < text.length && CLOSERS.test(text[to]!)) to++;
        close(to);
        k = to;
        continue;
      }
    }
    k++;
  }
  close(text.length);
  return out;
}
