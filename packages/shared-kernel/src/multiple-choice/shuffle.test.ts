// README §"mcShuffled" — seeded, reproducible, and `fixed` options pinned last.

import { describe, expect, it } from 'vitest';

import { identityShuffle, ordered, shuffled } from './shuffle.js';
import { option } from './fixtures.test-support.js';

describe('shuffled', () => {
  it('is deterministic for a seed and reorders for another', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffled(items, 7)).toEqual(shuffled(items, 7));
    expect(shuffled(items, 7)).not.toEqual(shuffled(items, 8));
    expect([...shuffled(items, 7)].sort()).toEqual(items);
  });

  it('does not mutate the input', () => {
    const items = ['a', 'b', 'c'];
    shuffled(items, 3);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('ordered', () => {
  it('pins fixed options last, in author order, whatever the shuffle does', () => {
    const options = [
      option({ id: 'a', text: 'er' }),
      option({ id: 'b', text: 'var' }),
      option({ id: 'z1', text: 'Alle over', fixed: true }),
      option({ id: 'c', text: 'har vært' }),
      option({ id: 'z2', text: 'Ingen av disse', fixed: true }),
    ];

    const result = ordered(options, (items) => [...items].reverse());

    expect(result.map((o) => o.id)).toEqual(['c', 'b', 'a', 'z1', 'z2']);
  });

  it('keeps author order under the identity shuffle', () => {
    const options = [option({ id: 'a' }), option({ id: 'b' })];
    expect(ordered(options, identityShuffle).map((o) => o.id)).toEqual(['a', 'b']);
  });
});
