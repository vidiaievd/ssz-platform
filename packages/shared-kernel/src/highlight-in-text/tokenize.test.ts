// SPEC_data_model §2. AC-M1: the engine's suite runs the same fixture through `dist`.

import { describe, expect, it } from 'vitest';

import { tokenize, wordsOf } from './tokenize.js';
import { TOKENIZER_FIXTURE } from './tokenizer-fixture.js';

describe('tokenize', () => {
  it('AC-M1: finds exactly the fixture words, each at its own offsets', () => {
    const tokens = tokenize(TOKENIZER_FIXTURE.text);
    expect(tokens.map((t) => t.w)).toEqual(TOKENIZER_FIXTURE.words);
    for (const t of tokens) expect(TOKENIZER_FIXTURE.text.slice(t.s, t.e)).toBe(t.w);
    expect(tokens.map((t) => t.i)).toEqual(tokens.map((_, i) => i));
  });

  it('keeps a hyphenated word whole, so it cannot be half-marked', () => {
    expect(tokenize('sjølv-stendig').map((t) => t.w)).toEqual(['sjølv-stendig']);
  });

  it('joins on straight and typographic apostrophes', () => {
    expect(tokenize("don't barn’s").map((t) => t.w)).toEqual(["don't", 'barn’s']);
  });

  it('never takes the punctuation next to a word', () => {
    expect(tokenize('Bodø, og «der».').map((t) => t.w)).toEqual(['Bodø', 'og', 'der']);
  });

  it('treats a trailing hyphen or apostrophe as punctuation', () => {
    expect(tokenize("sjø- og land' -side").map((t) => t.w)).toEqual(['sjø', 'og', 'land', 'side']);
  });

  it('counts numerals as tokens', () => {
    expect(tokenize('I 1998, førti år').map((t) => t.w)).toEqual(['I', '1998', 'førti', 'år']);
  });

  it('is not Norwegian — Cyrillic and Latin alike', () => {
    expect(tokenize('Прочитайте текст, mark it.').map((t) => t.w)).toEqual(['Прочитайте', 'текст', 'mark', 'it']);
  });

  it('returns nothing for an empty or punctuation-only text', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(' — , . ')).toEqual([]);
  });
});

describe('wordsOf', () => {
  it('lower-cases, for case-insensitive matching', () => {
    expect(wordsOf('I fjor Sommer,')).toEqual(['i', 'fjor', 'sommer']);
  });
});
