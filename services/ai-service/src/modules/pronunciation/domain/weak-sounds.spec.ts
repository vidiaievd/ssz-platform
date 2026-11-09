import { alignWord, type AssessedWord, type LexiconVariant } from './align-word.js';
import { isFunctionWord, weakSounds } from './weak-sounds.js';

// Plan 88, step 5: which of Azure's sounds are a remark.

function word(text: string, ...scores: number[]): AssessedWord {
  return {
    text,
    error: 'none',
    phonemes: scores.map((accuracy, i) => ({ startMs: i * 100, durationMs: 100, accuracy })),
  };
}

const weak = (
  w: AssessedWord,
  variants: LexiconVariant[],
  functionWord = false,
  context: 'fluent' | 'word' = 'fluent',
) =>
  weakSounds(alignWord(w, variants), context, functionWord).map((s) => [s.family, s.symbols, s.accuracy, s.threshold]);

describe('weakSounds', () => {
  it('flags a scored family below its native threshold, not at it', () => {
    // KJ: 53 in both contexts.
    expect(weak(word('kjøkken', 52, 95, 90, 90, 90), [{ nofabet: 'KJ OEH1 K AX0 N' }])).toEqual([
      ['kj', ['KJ'], 52, 53],
    ]);
    expect(weak(word('kjøkken', 53, 95, 90, 90, 90), [{ nofabet: 'KJ OEH1 K AX0 N' }])).toEqual([]);
  });

  it('says nothing of a sound not scored in the context (schwa, retroflex, consonants)', () => {
    expect(weak(word('kjøkken', 90, 95, 5, 5, 5), [{ nofabet: 'KJ OEH1 K AX0 N' }])).toEqual([]);
  });

  it('scores vowel length on a single word only', () => {
    // AA: no fluent threshold, 64 on a word.
    expect(weak(word('tak', 90, 40, 90), [{ nofabet: 'T AA1 K' }])).toEqual([]);
    expect(weak(word('tak', 90, 40, 90), [{ nofabet: 'T AA1 K' }], false, 'word')).toEqual([
      ['vowel_length', ['AA'], 40, 64],
    ]);
  });

  // §0.8 (6): «uten» UH / UU — the symbol is unnamed, the family is ʉ, the softer threshold counts.
  it('keeps the family where the variants differ in the symbol only, by the softer threshold', () => {
    const uten: LexiconVariant[] = [{ nofabet: 'UH1 T AX0 N' }, { nofabet: 'UU1 T AX0 N' }];
    const a = alignWord(word('uten', 40, 90, 90, 90), uten);
    expect(a.status === 'aligned' && a.sounds[0]).toMatchObject({ symbol: null, symbols: ['UH', 'UU'], family: 'uu' });
    expect(weak(word('uten', 40, 90, 90, 90), uten)).toEqual([['uu', ['UH', 'UU'], 40, 49]]);
    expect(weak(word('uten', 60, 90, 90, 90), uten)).toEqual([]);
  });

  it('says nothing where the variants differ in family («er» AE1 / AX0)', () => {
    expect(weak(word('er', 10, 90), [{ nofabet: 'AE1 R' }, { nofabet: 'AX0 R' }])).toEqual([]);
  });

  // §0.8 (5): a function word's reduced form is right — its vowel is not scored in fluent speech.
  it('does not score a function word’s vowel in fluent speech, but does its consonants and on a word', () => {
    const du: LexiconVariant[] = [{ nofabet: 'D UU1' }];
    expect(weak(word('du', 90, 20), du, true)).toEqual([]);
    expect(weak(word('du', 90, 20), du, true, 'word')).toEqual([['uu', ['UU'], 20, 77]]);
    expect(weak(word('kjære', 10, 90, 90, 90), [{ nofabet: 'KJ AE1 R AX0' }], true)).toEqual([['kj', ['KJ'], 10, 53]]);
  });

  it('gives nothing for an unaligned word', () => {
    expect(weak(word('api', 10, 10, 10), [])).toEqual([]);
  });
});

describe('isFunctionWord', () => {
  it('goes by the tag where there is one', () => {
    expect(isFunctionWord('AUX', [{ nofabet: 'AE1 R', pos: 'VB' }])).toBe(true);
    expect(isFunctionWord('NOUN', [{ nofabet: 'P OA1', pos: 'PP' }])).toBe(false);
  });

  it('goes by the lexicon when untagged: every reading a function word', () => {
    expect(
      isFunctionWord(null, [
        { nofabet: 'P OA1', pos: 'PP' },
        { nofabet: 'P OAH1', pos: 'PP' },
      ]),
    ).toBe(true);
    expect(
      isFunctionWord(null, [
        { nofabet: 'AE1 R', pos: 'VB' },
        { nofabet: 'AX0 R', pos: 'VB' },
      ]),
    ).toBe(false);
    expect(isFunctionWord(null, [])).toBe(false);
  });
});
