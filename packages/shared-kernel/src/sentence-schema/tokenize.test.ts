// IMPLEMENTATION.md, "Suggested tests": re-tokenizing must preserve the author's work,
// and merge/split must round-trip.

import { describe, expect, it } from 'vitest';

import { chunk } from './fixtures.test-support.js';
import { chunksToText, join, retokenize, split, tokenize } from './tokenize.js';

describe('tokenize', () => {
  it('splits on whitespace and drops empties', () => {
    expect(tokenize('  I   morgen  skal jeg ')).toEqual(['I', 'morgen', 'skal', 'jeg']);
  });

  it('returns nothing for an empty sentence', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('retokenize', () => {
  it('keeps placements when a typo is fixed elsewhere in the sentence', () => {
    const before = [chunk('c1', 'Jeg', 'n'), chunk('c2', 'leser', 'v'), chunk('c3', 'bokaa', 'N')];
    const after = retokenize('Jeg leser boka', before);

    expect(after.map((c) => c.text)).toEqual(['Jeg', 'leser', 'boka']);
    expect(after[0]!.id).toBe('c1');
    expect(after[0]!.field).toBe('n');
    expect(after[1]!.field).toBe('v');
    // The corrected word is a new token: nothing in the old list read `boka`.
    expect(after[2]!.field).toBeNull();
  });

  it('gives a duplicated word one placement each, not the same one twice', () => {
    const before = [chunk('c1', 'ikke', 'a'), chunk('c2', 'ikke', 'A')];
    const after = retokenize('ikke ikke', before);

    expect(after.map((c) => c.field)).toEqual(['a', 'A']);
    expect(new Set(after.map((c) => c.id)).size).toBe(2);
  });

  it('drops only the placement of a deleted word', () => {
    const before = [chunk('c1', 'Jeg', 'n'), chunk('c2', 'ikke', 'a'), chunk('c3', 'leser', 'v')];
    const after = retokenize('Jeg leser', before);

    expect(after.map((c) => c.id)).toEqual(['c1', 'c3']);
    expect(after.map((c) => c.field)).toEqual(['n', 'v']);
  });

  it('keeps a joined chunk whole rather than splitting it back apart', () => {
    const before = [chunk('c1', 'I morgen', 'F'), chunk('c2', 'skal', 'v')];
    const after = retokenize('I morgen skal', before);

    expect(after.map((c) => c.text)).toEqual(['I morgen', 'skal']);
    expect(after[0]!.field).toBe('F');
  });

  it('lets the longer chunk claim its words before a shorter twin can', () => {
    const before = [chunk('c1', 'I', 'A'), chunk('c2', 'I morgen', 'F')];
    const after = retokenize('I morgen', before);

    expect(after).toHaveLength(1);
    expect(after[0]!.text).toBe('I morgen');
    expect(after[0]!.field).toBe('F');
  });

  it('never carries a placement from an unplaced chunk', () => {
    const before = [chunk('c1', 'jeg', null)];
    const after = retokenize('jeg', before);

    expect(after[0]!.field).toBeNull();
    // A fresh chunk, so nothing keyed by the old id (row.fb) survives a state it never had.
    expect(after[0]!.id).not.toBe('c1');
  });
});

describe('join and split', () => {
  const chunks = [chunk('c1', 'I', 'F', ['A']), chunk('c2', 'morgen', 'A'), chunk('c3', 'skal', 'v')];

  it('joins into the left chunk, keeping its id, field and alts', () => {
    const joined = join(chunks, 0);

    expect(joined.map((c) => c.text)).toEqual(['I morgen', 'skal']);
    expect(joined[0]!.id).toBe('c1');
    expect(joined[0]!.field).toBe('F');
    expect(joined[0]!.alt).toEqual(['A']);
  });

  it('round-trips back to the original token count', () => {
    expect(split(join(chunks, 0), 0).map((c) => c.text)).toEqual(['I', 'morgen', 'skal']);
  });

  it('splits with every word inheriting the field but none of the alts', () => {
    const parts = split(join(chunks, 0), 0);

    expect(parts[0]!.field).toBe('F');
    expect(parts[1]!.field).toBe('F');
    expect(parts[0]!.alt).toEqual([]);
    expect(parts[1]!.alt).toEqual([]);
  });

  it('leaves a single-word chunk alone', () => {
    expect(split(chunks, 2)).toEqual(chunks);
  });

  it('leaves the list alone when there is nothing to join with', () => {
    expect(join(chunks, 2)).toEqual(chunks);
  });
});

describe('chunksToText', () => {
  it('reads the row back as a sentence', () => {
    expect(chunksToText([chunk('c1', 'I morgen', 'F'), chunk('c2', 'skal', 'v')])).toBe('I morgen skal');
  });
});
