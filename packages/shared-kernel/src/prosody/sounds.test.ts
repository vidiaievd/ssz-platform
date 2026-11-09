// Plan 86, step 6d — the sounds under a word's letters: coverage and the teacher's respelling.

import { describe, expect, it } from 'vitest';

import { respell, segsCoverWord, type SoundSeg } from './sounds.js';

const seg = (s: number, e: number, patch: Partial<SoundSeg> = {}): SoundSeg => ({
  s,
  e,
  kind: 'consonant',
  sounds: [],
  stress: null,
  long: null,
  tie: false,
  ...patch,
});

// tunge → T OH2 NG AX0
const TUNGE: SoundSeg[] = [
  seg(0, 1, { sounds: ['T'] }),
  seg(1, 2, { kind: 'vowel', sounds: ['OH'], stress: 2, long: false }),
  seg(2, 4, { sounds: ['NG'], tie: true }),
  seg(4, 5, { kind: 'vowel', sounds: ['AX'], stress: 0, long: false }),
];

describe('segsCoverWord', () => {
  it('accepts segments in order over every letter', () => {
    expect(segsCoverWord(TUNGE, 5)).toBe(true);
  });

  it('rejects a gap, an overlap, a short cover and no segments', () => {
    expect(segsCoverWord([seg(0, 1), seg(2, 3)], 3)).toBe(false);
    expect(segsCoverWord([seg(0, 2), seg(1, 3)], 3)).toBe(false);
    expect(segsCoverWord(TUNGE, 6)).toBe(false);
    expect(segsCoverWord([], 0)).toBe(false);
  });

  it('allows a sound the spelling does not write', () => {
    const inserted = seg(3, 3, { kind: 'vowel', sounds: ['AX'], stress: 0, long: false });
    expect(segsCoverWord([seg(0, 3, { sounds: ['K'] }), inserted], 3)).toBe(true);
  });
});

describe('respell', () => {
  it('writes the sounds in the teacher’s letters and drops silent ones', () => {
    expect(respell(TUNGE)).toBe('toŋe');
    const godt: SoundSeg[] = [
      seg(0, 1, { sounds: ['G'] }),
      seg(1, 2, { kind: 'vowel', sounds: ['OH'], stress: 1, long: false }),
      seg(2, 3, { kind: 'silent' }),
      seg(3, 4, { sounds: ['T'] }),
    ];
    expect(respell(godt)).toBe('got');
  });

  it('marks a long stressed monophthong with ː and a diphthong with nothing', () => {
    const jerne: SoundSeg[] = [seg(0, 2, { kind: 'vowel', sounds: ['AE'], stress: 1, long: true })];
    expect(respell(jerne)).toBe('æː');
    const seg2: SoundSeg[] = [seg(0, 2, { kind: 'vowel', sounds: ['AEJ'], stress: 1, long: true })];
    expect(respell(seg2)).toBe('æi');
  });

  it('puts no length mark on an unstressed long vowel', () => {
    expect(respell([seg(0, 1, { kind: 'vowel', sounds: ['II'], stress: 0, long: true })])).toBe('i');
  });

  it('reads two sounds of one segment in order', () => {
    expect(respell([seg(0, 1, { sounds: ['K', 'S'] })])).toBe('ks');
  });
});
