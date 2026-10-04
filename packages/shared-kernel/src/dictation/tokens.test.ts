import { describe, expect, it } from 'vitest';

import { TOKENIZER_FIXTURE } from '../text/words-fixture.js';
import { tokenize } from '../text/words.js';
import { tokens, wordCount } from './tokens.js';

describe('tokens', () => {
  it('uses the platform tokenizer — the same words as highlight_in_text (AC-M1)', () => {
    expect(tokens(TOKENIZER_FIXTURE.text).map((t) => t.w)).toEqual(
      tokenize(TOKENIZER_FIXTURE.text).map((t) => t.w),
    );
  });

  it('carries the punctuation to the right of each word, whitespace removed', () => {
    expect(tokens('Hun sa: «Hei» , og gikk.').map((t) => [t.w, t.p])).toEqual([
      ['Hun', ''],
      ['sa', ':«'],
      ['Hei', '»,'],
      ['og', ''],
      ['gikk', '.'],
    ]);
  });

  it('treats a line break as a space', () => {
    expect(tokens('en\nto').map((t) => t.w)).toEqual(['en', 'to']);
  });

  it('counts words', () => {
    expect(wordCount('  Vi  hadde ikke. ')).toBe(3);
    expect(wordCount('')).toBe(0);
  });
});
