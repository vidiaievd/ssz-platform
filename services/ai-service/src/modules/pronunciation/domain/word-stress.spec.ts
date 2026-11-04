import type { LexiconVariant } from './align-word.js';
import { soundsOfWord, stressOfVariant, stressOfWord, writtenNuclei } from './word-stress.js';

// Plan 86, step 5b: the lexicon's stress placed in the written word. Rows as NB Uttale østnorsk
// has them in ai_db; the words are from the dev lessons (03.11).

const at = (word: string, nofabet: string) => {
  const s = stressOfVariant(word, nofabet);
  return s && `${word.slice(0, s.vowel.s)}[${word.slice(s.vowel.s, s.vowel.e)}]${word.slice(s.vowel.e)}`;
};

describe('writtenNuclei', () => {
  it('takes a diphthong as one nucleus and two other vowels as two', () => {
    expect(writtenNuclei('reise')).toEqual([
      { s: 1, e: 3 },
      { s: 4, e: 5 },
    ]);
    expect(writtenNuclei('familie').map((n) => n.s)).toEqual([1, 3, 5, 6]);
  });
});

describe('stressOfVariant', () => {
  it('places the primary nucleus where the counts agree', () => {
    expect(stressOfVariant('heter', 'H EE2 T AX0 R')).toEqual({ toneme: 2, vowel: { s: 1, e: 2, long: true } });
    expect(stressOfVariant('snakker', 'S N AH2 K AX0 R')).toEqual({ toneme: 2, vowel: { s: 2, e: 3, long: false } });
    expect(at('familie', 'F AH0 M II1 L IH0 AX0')).toBe('fam[i]lie');
  });

  it('marks a diphthong long and a monosyllable without a toneme', () => {
    expect(stressOfVariant('reise', 'R AEJ2 S AX0')).toEqual({ toneme: 2, vowel: { s: 1, e: 3, long: true } });
    expect(stressOfVariant('norsk', 'N OAH1 RS K')).toEqual({ toneme: null, vowel: { s: 1, e: 2, long: false } });
  });

  it('counts a syllabic consonant as a nucleus', () => {
    expect(at('hesten', 'H EH1 S T NX0')).toBe('h[e]sten');
    expect(at('morgen', 'M OA2 RNX0')).toBe('m[o]rgen');
  });

  it('places a stressed first syllable when a schwa is lost or -eren is one sound', () => {
    expect(at('en', 'EE1 AX0 N')).toBe('[e]n');
    expect(at('læreren', 'L AE2 R AX0 RN')).toBe('l[æ]reren');
    expect(at('virkelighet', 'V IH2 R K L IH0 H EE3 T')).toBe('v[i]rkelighet');
  });

  it('counts a stressed last syllable from the end', () => {
    expect(at('interessert', 'IH0 N T R AX0 S EE1 RT')).toBe('interess[e]rt');
    expect(at('usa', 'UU3 AX0 S AA1')).toBe('us[a]');
    expect(at('zoolog', 'S OH0 L OA1 G')).toBe('zool[o]g');
  });

  it('takes a one-sound spelling of adjacent vowels whole', () => {
    expect(at('team', 'T II1 M')).toBe('t[ea]m');
    expect(at('grieg', 'G R IH1 G')).toBe('gr[ie]g');
  });

  it('does not guess', () => {
    // A glide written as a vowel before the stressed one.
    expect(at('yoghurt', 'J OH1 G UH0 RT')).toBeNull();
    // Inside a word of differing counts.
    expect(at('journalister', 'SJ OH0 RN AH0 L IH1 S T AX0 R')).toBeNull();
    expect(at('amerikaneren', 'AH0 M AX0 R IH0 K AA1 N AX0 RN')).toBeNull();
    // No primary stress, several words, no vowel letter, an unknown symbol.
    expect(at('er', 'AX0 R')).toBeNull();
    expect(at('as', 'AA1 _ EH1 S')).toBeNull();
    expect(at('df', 'D EE2 EH3 F')).toBeNull();
    expect(at('ok', 'Q1')).toBeNull();
  });
});

describe('stressOfWord', () => {
  const KOMMER: LexiconVariant[] = [
    { nofabet: 'K OAH2 M AX0 R', pos: 'NN' },
    { nofabet: 'K OAH1 M AX0 R', pos: 'VB' },
  ];

  it('marks a word whose variants agree', () => {
    const reise = [
      { nofabet: 'R AEJ2 S AX0', pos: 'NN' },
      { nofabet: 'R AEJ2 S AX0', pos: 'VB' },
    ];
    expect(stressOfWord('Reise', reise, null)?.toneme).toBe(2);
  });

  it('leaves a homograph the context did not settle unmarked', () => {
    expect(stressOfWord('kommer', KOMMER, null)).toBeNull();
    expect(stressOfWord('kommer', [KOMMER[1]!], 'VERB')?.toneme).toBe(1);
  });

  it('keeps length only where the variants agree on it', () => {
    const oevde = [
      { nofabet: 'OEH2 V D AX0', pos: 'VB' },
      { nofabet: 'OE2 V D AX0', pos: 'VB' },
    ];
    expect(stressOfWord('øvde', oevde, 'VERB')?.vowel).toEqual({ s: 0, e: 1, long: null });
  });

  it('does not mark a function word — by its tag, or by the lexicon when untagged', () => {
    const paa = [
      { nofabet: 'P OA1', pos: 'PP' },
      { nofabet: 'P OAH1', pos: 'PP' },
    ];
    expect(stressOfWord('på', paa, null)).toBeNull();
    expect(stressOfWord('har', [{ nofabet: 'H AA1 R', pos: 'VB' }], 'AUX')).toBeNull();
    expect(stressOfWord('har', [{ nofabet: 'H AA1 R', pos: 'VB' }], null)?.toneme).toBeNull();
  });

  it('marks nothing without variants', () => {
    expect(stressOfWord('xyz', [], 'NOUN')).toBeNull();
  });
});

describe('soundsOfWord', () => {
  it('lays a word whose variants all lay the same way', () => {
    const segs = soundsOfWord('tunge', [
      { nofabet: 'T OH2 NG AX0', pos: 'NN' },
      { nofabet: 'T OH2 NG AX0', pos: 'VB' },
    ]);
    expect(segs?.map((x) => [x.s, x.e])).toEqual([
      [0, 1],
      [1, 2],
      [2, 4],
      [4, 5],
    ]);
  });

  it('gives none to a homograph whose variants differ, a word that does not align and an empty list', () => {
    expect(
      soundsOfWord('kommer', [
        { nofabet: 'K OAH2 M AX0 R', pos: 'NN' },
        { nofabet: 'K OAH1 M AX0 R', pos: 'VB' },
      ]),
    ).toBeNull();
    expect(soundsOfWord('community', [{ nofabet: 'K OAH0 M J UU1 N IH0 T IH0' }])).toBeNull();
    expect(soundsOfWord('tunge', [])).toBeNull();
  });
});
