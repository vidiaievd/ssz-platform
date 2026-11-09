import { NB_FAMILIES, NB_SOUNDS } from './nb-sounds.data.js';
import {
  assessedFamilies,
  assessmentOf,
  parseNofabet,
  parseNofabetToken,
  soundOf,
  splitSyllabic,
} from './sound-inventory.js';

// Every symbol NB Uttale's e_written / e_spoken use (plan 88, step 1 import).
const LEXICON_SYMBOLS =
  'AA AE AEH AEJ AEW AH AJ AX B D EE EH F G H IH II J K KJ L LX M N NG NX OA OAH OAJ OE OEH OEJ OH OO OU P R RD RL RLX RN RNX RS RT S SJ T UH UU V YH YY _'.split(
    ' ',
  );

describe('NB sound inventory (plan 88, step 2)', () => {
  it('covers exactly the symbols of the lexicon', () => {
    expect(Object.keys(NB_SOUNDS).sort()).toEqual([...LEXICON_SYMBOLS].sort());
  });

  it('pairs long and short vowels both ways', () => {
    for (const [symbol, entry] of Object.entries(NB_SOUNDS)) {
      if (!entry.lengthPair) continue;
      const pair = NB_SOUNDS[entry.lengthPair];
      expect(pair.lengthPair).toBe(symbol);
      expect(pair.long).toBe(!entry.long);
    }
  });

  it('files every sound under a known family and scores within 0–100', () => {
    for (const entry of Object.values(NB_SOUNDS)) {
      if (entry.family) expect(NB_FAMILIES[entry.family]).toBeDefined();
      if (!entry.assess) continue;
      expect(NB_FAMILIES[entry.assess.family]).toBeDefined();
      for (const t of [entry.assess.fluent, entry.assess.word]) if (t != null) expect(t >= 0 && t <= 100).toBe(true);
    }
  });

  it('scores only the families of Q3, vowel length on single words only', () => {
    expect(assessedFamilies('fluent').sort()).toEqual(['ae', 'kj', 'oe', 'sj', 'uu', 'y']);
    expect(assessedFamilies('word').sort()).toEqual(['ae', 'kj', 'oe', 'sj', 'uu', 'vowel_length', 'y']);
    for (const symbol of ['RS', 'RT', 'RN', 'AX', 'R', 'S', 'T', 'OAH', 'AEH']) {
      expect(assessmentOf(symbol, 'fluent')).toBeNull();
      expect(assessmentOf(symbol, 'word')).toBeNull();
    }
  });

  // The errors Azure was seen to catch in session 1 (§0.2) clear the threshold; the score natives
  // usually get does not.
  it.each([
    ['KJ', 'word', 0, true], // kj → k in «kjøkken»
    ['KJ', 'fluent', 18, true],
    ['SJ', 'fluent', 40, true], // sj → s in «sju»
    ['UU', 'word', 40, true], // ʉ → u in «hus»
    ['OE', 'word', 40, true], // ø → o in «søt»
    ['AE', 'fluent', 40, true], // æ → e in «være»
    ['AA', 'word', 40, true], // «tak» said short
    ['KJ', 'word', 80, false],
    ['UU', 'fluent', 90, false],
  ] as const)('%s in %s scored %d → remark %s', (symbol, context, score, remark) => {
    const a = assessmentOf(symbol, context);
    expect(a).not.toBeNull();
    expect(score < a!.threshold).toBe(remark);
  });

  it('files a short-said long vowel under length, a ʉ under its own family', () => {
    expect(assessmentOf('AA', 'word')?.family).toBe('vowel_length');
    expect(assessmentOf('AA', 'fluent')).toBeNull();
    expect(assessmentOf('UU', 'word')?.family).toBe('uu');
  });

  it('splits a token into symbol and stress', () => {
    expect(parseNofabetToken('OEH2')).toEqual({ symbol: 'OEH', stress: 2 });
    expect(parseNofabetToken('KJ')).toEqual({ symbol: 'KJ', stress: null });
    expect(parseNofabet('KJ OEH1 K AX0 N')?.map((t) => t.symbol)).toEqual(['KJ', 'OEH', 'K', 'AX', 'N']);
    expect(parseNofabet('KJ XX1')).toBeNull();
    expect(soundOf('RS')?.ipa).toBe('ʂ');
    expect(soundOf('XX')).toBeNull();
  });

  // Step 9.1: Azure splits -en / -ern as spelled (17 words × 3 voices, 02.11).
  const split = (nofabet: string, spelling?: string) =>
    splitSyllabic(parseNofabet(nofabet)!, spelling)
      ?.map((t) => `${t.symbol}${t.stress ?? ''}`)
      .join(' ');

  it('splits a syllabic consonant into what Azure hears, the stress on the schwa', () => {
    expect(split('H EH1 S T NX0')).toBe('H EH1 S T AX0 N');
    expect(split('D OE1 RNX0')).toBe('D OE1 R AX0 N');
    expect(split('B OEH2 N AX0 R')).toBeUndefined();
  });

  it('drops the r of -ern after a retroflex that holds it («konserten», «perlen»)', () => {
    expect(split('K OAH0 N S AEH1 RT RNX0')).toBe('K OAH0 N S AEH1 RT AX0 N');
    expect(split('P AE2 RL RNX0')).toBe('P AE2 RL AX0 N');
  });

  it('splits a word-final -ern as spelled where Azure hears a silent letter («morgen»)', () => {
    expect(split('M OA2 RNX0', 'morgen')).toBe('M OA2 R G AX0 N');
    expect(split('H OEH2 S T M OA3 RNX0', 'Høstmorgen')).toBe('H OEH2 S T M OA3 R G AX0 N');
    expect(split('G OA1 RNX0', 'gården')).toBe('G OA1 R AX0 N');
  });

  it('splits only syllabic consonants, into sounds the inventory has', () => {
    for (const [symbol, entry] of Object.entries(NB_SOUNDS)) {
      if (!entry.split) continue;
      expect(symbol).toMatch(/X$/);
      for (const sounds of [entry.split, ...Object.values(entry.splitSpelled ?? {})]) {
        expect(sounds.filter((s) => NB_SOUNDS[s]?.kind === 'vowel')).toEqual(['AX']);
        // Nothing split is scored: the split must not bring a remark the syllable did not have.
        expect(sounds.every((s) => NB_SOUNDS[s]!.assess === null)).toBe(true);
      }
    }
  });
});
