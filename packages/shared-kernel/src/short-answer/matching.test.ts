// Every row of BEHAVIOR.md §"Matching — worked cases", plus the typo boundary the
// IMPLEMENTATION.md checklist names in both directions.

import { describe, expect, it } from 'vitest';

import { hasAnchor, levenshtein, normalize, wordEquals, words } from './matching.js';

const answer = (text: string) => words(text);

describe('normalize', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalize('  «Lys,   FORAN» og bak! ')).toBe('lys foran og bak');
  });

  it('turns dashes into separators rather than deleting them', () => {
    // `e-post` must not become the single word `epost`, or an anchor written with the
    // hyphen would stop matching an answer written without it.
    expect(words('e-post')).toEqual(['e', 'post']);
  });

  it('survives an empty answer', () => {
    expect(words('')).toEqual([]);
    expect(words('   ')).toEqual([]);
  });
});

describe('levenshtein', () => {
  it('is 0 for identical words', () => {
    expect(levenshtein('familien', 'familien')).toBe(0);
  });

  it('counts a single substitution', () => {
    expect(levenshtein('familen', 'familien')).toBe(1);
  });

  it('early-exits to 2 when the lengths differ by more than one', () => {
    expect(levenshtein('a', 'abcdef')).toBe(2);
  });
});

describe('wordEquals — the three-character boundary', () => {
  it('tolerates one slip when both words are longer than three characters', () => {
    expect(wordEquals('familen', 'familien', true)).toBe(true);
  });

  it('does not tolerate it at exactly three characters', () => {
    // BEHAVIOR.md's `bak` / `bok` row: this is what keeps them apart.
    expect(wordEquals('bok', 'bak', true)).toBe(false);
  });

  it('does not tolerate it when only one side is longer than three', () => {
    expect(wordEquals('lyys', 'lys', true)).toBe(false);
  });

  it('tolerates nothing at all with typos off', () => {
    expect(wordEquals('familen', 'familien', false)).toBe(false);
    expect(wordEquals('familien', 'familien', false)).toBe(true);
  });
});

describe('hasAnchor — BEHAVIOR.md worked cases', () => {
  const anchors = ['lys foran', 'lys bak', 'foran og bak'];
  const matches = (text: string) => anchors.some((a) => hasAnchor(answer(text), a, true));

  it('finds a contiguous run', () => {
    expect(matches('Sykler må ha lys foran og bak.')).toBe(true);
  });

  it('folds case and strips punctuation first', () => {
    expect(matches('Lys, foran og bak!')).toBe(true);
  });

  it('rejects the same words out of order', () => {
    expect(matches('Foran må det være lys')).toBe(false);
  });

  it('rejects a typo in a three-letter anchor word', () => {
    // The trap: `lys` is three characters, so the tolerance does not reach it. The fix
    // in the builder is another anchor variant, not a wider tolerance.
    expect(matches('Man må ha lyys foran')).toBe(false);
  });

  it('accepts a typo in a longer anchor word', () => {
    expect(hasAnchor(answer('Hun savner familen sin'), 'savner familien', true)).toBe(true);
  });

  it('is order-sensitive inside a phrase', () => {
    expect(hasAnchor(answer('bak og foran er det lys'), 'lys foran', true)).toBe(false);
  });

  it('ignores an empty or whitespace anchor', () => {
    expect(hasAnchor(answer('hva som helst'), '', true)).toBe(false);
    expect(hasAnchor(answer('hva som helst'), '   ', true)).toBe(false);
  });

  it('does not match an anchor longer than the answer', () => {
    expect(hasAnchor(answer('lys'), 'lys foran og bak', true)).toBe(false);
  });
});
