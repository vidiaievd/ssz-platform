import { storedReferenceOf } from './stored-reference.js';

// What media's `describe` gives for *bønner* (plan 88, step 8.2): two voices tried, the second kept.
const BONNER = {
  word: 'bønner',
  sentence: 'Nå sier jeg bønner igjen.',
  tone: 2,
  wordSpan: { startMs: 820, endMs: 1240 },
  stressedVowel: { startMs: 870, endMs: 940 },
  tries: [
    {
      voice: 'nb-NO-FinnNeural',
      outcome: 'tone_unsure',
      accuracy: 97,
      measure: { onset: 1, post: -1, score: 2, tone: null },
    },
    {
      voice: 'nb-NO-PernilleNeural',
      outcome: 'kept',
      accuracy: 98,
      measure: { onset: 2.1, post: -1.2, score: 3.3, tone: 2 },
    },
  ],
};

describe('storedReferenceOf (plan 88, step 8.2)', () => {
  it('takes the kept voice’s score, not an earlier try’s', () => {
    expect(storedReferenceOf(BONNER)).toEqual({
      word: 'bønner',
      sentence: 'Nå sier jeg bønner igjen.',
      tone: 2,
      wordSpan: { startMs: 820, endMs: 1240 },
      stressedVowel: { startMs: 870, endMs: 940 },
      score: 3.3,
      voice: 'nb-NO-PernilleNeural',
    });
  });

  it('tells a word without a toneme from an asset that is no reference', () => {
    expect(storedReferenceOf({ ...BONNER, tone: null, stressedVowel: null })).toBe('no_toneme');
    expect(storedReferenceOf(null)).toBe('not_a_reference');
    expect(storedReferenceOf({ textHash: 'a' })).toBe('not_a_reference');
  });

  it.each([
    ['a toneme it does not know', { ...BONNER, tone: 3 }],
    ['no stressed vowel', { ...BONNER, stressedVowel: null }],
    ['a backwards span', { ...BONNER, wordSpan: { startMs: 900, endMs: 800 } }],
    ['no try kept last', { ...BONNER, tries: BONNER.tries.slice(0, 1) }],
    ['no tries', { ...BONNER, tries: [] }],
    ['a kept try without a measure', { ...BONNER, tries: [{ ...BONNER.tries[1], measure: null }] }],
  ])('refuses a check with %s', (_label, raw) => {
    expect(storedReferenceOf(raw)).toBe('not_a_reference');
  });
});
