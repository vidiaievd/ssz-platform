import { lexicalWord } from '../../providers/domain/lexical.js';
import { errorOf, phonemesOf, type AzureWord } from '../../providers/infrastructure/azure-speech/azure-result.js';
import { alignWord, type AssessedWord, type WordAlignment } from './align-word.js';
import { LEXICON, REST_WORDS, SDK_WORDS } from './align-word.fixture.js';

function assessed(word: AzureWord): AssessedWord {
  return { text: lexicalWord(word.Word), error: errorOf(word), phonemes: phonemesOf(word) };
}

function alignAll(words: AzureWord[]): WordAlignment[] {
  return words.map(assessed).map((w) => alignWord(w, LEXICON[w.text] ?? []));
}

function aligned(alignment: WordAlignment) {
  if (alignment.status !== 'aligned') throw new Error(`${alignment.text}: ${alignment.reason}`);
  return alignment;
}

const symbols = (a: WordAlignment) => aligned(a).sounds.map((s) => s.symbol);
const scores = (a: WordAlignment) => aligned(a).sounds.map((s) => s.accuracy);

describe('alignWord (plan 88, step 3)', () => {
  describe('on recorded answers of session 1', () => {
    it.each([
      ['REST', REST_WORDS],
      ['SDK', SDK_WORDS],
    ])('names the sounds of most words read (%s)', (_, words) => {
      const all = alignAll(words);
      const scored = all.filter((a) => a.status === 'aligned' || a.reason !== 'not_scored');
      const share = scored.filter((a) => a.status === 'aligned').length / scored.length;
      // §0.3: 89 % of learners' words; words outside the lexicon (numbers, «api») count against it.
      expect(share).toBeGreaterThan(0.75);
    });

    it('reads REST and SDK shapes alike: times in ms, scores per sound', () => {
      const [first] = alignAll(REST_WORDS).filter((a) => a.text === 'fokuser');
      const sound = aligned(first!).sounds[0]!;
      expect(sound.startMs).toBeGreaterThan(0);
      expect(sound.durationMs).toBeGreaterThan(0);
      const sdk = alignAll(SDK_WORDS).find((a) => a.text === 'fokuser');
      expect(aligned(sdk!).sounds.every((s) => s.accuracy >= 0 && s.accuracy <= 100)).toBe(true);
    });

    // «fokuser» is a noun (F OO1 … AX0 R, plural of «fokus») and a verb (F OH0 … EE1 R) of the
    // same length: the sounds they differ in stay unnamed, and so does the stress.
    it('leaves the sounds of «fokuser» its two variants differ in unnamed', () => {
      const a = alignAll(REST_WORDS).find((x) => x.text === 'fokuser')!;
      expect(symbols(a)).toEqual(['F', null, 'K', 'UH', 'S', null, 'R']);
      expect(aligned(a).primaryIndex).toBeNull();
      expect(aligned(a).variants).toHaveLength(2);
    });

    // §0.3: with the verb's variant alone, stress moved to the first syllable shows — everything
    // from the stressed EE on failed.
    it('names the failed sounds of the verb «fokuser» from the stressed vowel on', () => {
      const w = REST_WORDS.map(assessed).find((x) => x.text === 'fokuser')!;
      const a = alignWord(
        w,
        LEXICON['fokuser']!.filter((v) => v.pos === 'VB'),
      );
      expect(symbols(a)).toEqual(['F', 'OH', 'K', 'UH', 'S', 'EE', 'R']);
      expect(aligned(a).primaryIndex).toBe(5);
      expect(aligned(a).sounds[5]).toMatchObject({ symbol: 'EE', stress: 1, primary: true, accuracy: 0 });
      // Stress on the last syllable: no toneme contrast.
      expect(aligned(a).tone).toBeNull();
    });

    // §0.3: the silent -t of «stedet» said — T and D failed.
    it('names T and D in «stedet»', () => {
      const a = alignAll(REST_WORDS).find((x) => x.text === 'stedet')!;
      expect(symbols(a)).toEqual(['S', 'T', 'EE', 'D', 'AX']);
      expect(scores(a)[1]).toBe(0);
      expect(scores(a)[3]).toBe(0);
    });

    it('leaves words outside the lexicon to the word level', () => {
      const a = alignAll(REST_WORDS).find((x) => x.text === 'api')!;
      expect(a).toMatchObject({ status: 'unaligned', reason: 'not_in_lexicon' });
    });
  });

  describe('rules', () => {
    const phonemes = (...accuracy: number[]) =>
      accuracy.map((score, i) => ({ startMs: 100 * i, durationMs: 90, accuracy: score }));
    const word = (text: string, ...accuracy: number[]): AssessedWord => ({
      text,
      error: 'none',
      phonemes: phonemes(...accuracy),
    });

    it('picks the variant with as many sounds as Azure heard («og»: OA1 / OA1 G)', () => {
      const variants = [{ nofabet: 'OA1' }, { nofabet: 'OA1 G' }];
      expect(symbols(alignWord(word('og', 90), variants))).toEqual(['OA']);
      expect(symbols(alignWord(word('og', 90, 40), variants))).toEqual(['OA', 'G']);
    });

    it('does not name a sound the variants disagree on («det»: D AX0 / D EE1)', () => {
      const a = alignWord(word('det', 90, 30), [{ nofabet: 'D AX0' }, { nofabet: 'D EE1' }]);
      expect(symbols(a)).toEqual(['D', null]);
      expect(aligned(a).sounds[1]).toMatchObject({ family: null, stress: null, primary: false, accuracy: 30 });
      expect(aligned(a).primaryIndex).toBeNull();
    });

    it('never guesses when the count differs', () => {
      const a = alignWord(word('kjøkken', 80, 80, 80, 80), [{ nofabet: 'KJ OEH1 K AX0 N' }]);
      expect(a).toEqual({
        status: 'unaligned',
        text: 'kjøkken',
        reason: 'count_mismatch',
        azureCount: 4,
        lexiconCounts: [5],
      });
    });

    it('names the toneme of a word with a syllable after the stress', () => {
      expect(aligned(alignWord(word('bønder', 1, 2, 3, 4, 5), [{ nofabet: 'B OEH1 N AX0 R' }])).tone).toBe(1);
      expect(aligned(alignWord(word('bønner', 1, 2, 3, 4, 5), [{ nofabet: 'B OEH2 N AX0 R' }])).tone).toBe(2);
      // A one-syllable word carries 1 by the lexicon's convention — no contrast.
      expect(aligned(alignWord(word('hus', 1, 2, 3), [{ nofabet: 'H UU1 S' }])).tone).toBeNull();
    });

    it('leaves the toneme of a homograph open («tømmer» noun 1 / verb 2)', () => {
      const a = alignWord(word('tømmer', 1, 2, 3, 4, 5), LEXICON['tømmer']!);
      expect(symbols(a)).toEqual(['T', 'OEH', 'M', 'AX', 'R']);
      expect(aligned(a).primaryIndex).toBe(1);
      expect(aligned(a).sounds[1]).toMatchObject({ primary: true, stress: null });
      expect(aligned(a).tone).toBeNull();
    });

    it('marks the family of each named sound', () => {
      const a = alignWord(word('kjøkken', 10, 90, 90, 90, 90), [{ nofabet: 'KJ OEH1 K AX0 N' }]);
      expect(aligned(a).sounds.map((s) => s.family)).toEqual(['kj', 'oe', 'consonant', 'schwa', 'consonant']);
      expect(aligned(a).sounds[0]!.ipa).toBe('ç');
    });

    it('skips a word boundary inside an entry («ok»: OH3 _ K AEJ1)', () => {
      expect(symbols(alignWord(word('ok', 90, 90, 90), [{ nofabet: 'OH3 _ K AEJ1' }]))).toEqual(['OH', 'K', 'AEJ']);
    });

    it.each([
      ['omission', 'not_scored'],
      ['insertion', 'not_scored'],
    ] as const)('does not align an %s', (error, reason) => {
      const a = alignWord({ ...word('hus', 90, 90, 90), error }, [{ nofabet: 'H UU1 S' }]);
      expect(a).toMatchObject({ status: 'unaligned', reason });
    });

    it('needs phonemes and known symbols', () => {
      expect(alignWord(word('hus'), [{ nofabet: 'H UU1 S' }])).toMatchObject({ reason: 'no_phonemes' });
      expect(alignWord(word('hus', 1, 2, 3), [{ nofabet: 'H XX1 S' }])).toMatchObject({ reason: 'unknown_symbol' });
    });
  });
});
