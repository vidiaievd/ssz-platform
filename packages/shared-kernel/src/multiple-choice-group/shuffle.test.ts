// README §"Row order is recomputed from `seed`" — deterministic and reproducible.

import { describe, expect, it } from 'vitest';

import { identityShuffle, shuffled } from './shuffle.js';

const rows = ['a', 'b', 'c', 'd', 'e', 'f'];

describe('shuffled', () => {
  it('returns the same order for the same seed', () => {
    expect(shuffled(rows, 42)).toEqual(shuffled(rows, 42));
  });

  it('returns a different order for a different seed', () => {
    expect(shuffled(rows, 1)).not.toEqual(shuffled(rows, 2));
  });

  it('keeps every element', () => {
    expect([...shuffled(rows, 7)].sort()).toEqual([...rows].sort());
  });

  it('does not mutate its input', () => {
    const input = [...rows];
    shuffled(input, 3);
    expect(input).toEqual(rows);
  });

  it('survives a zero seed', () => {
    expect([...shuffled(rows, 0)].sort()).toEqual([...rows].sort());
  });
});

describe('identityShuffle', () => {
  it('is author order, copied', () => {
    const out = identityShuffle(rows);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });
});
