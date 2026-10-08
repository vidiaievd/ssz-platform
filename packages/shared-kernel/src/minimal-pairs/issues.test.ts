// Every code fires on its own broken model and stays quiet on its neighbour (plan 72 §4.4).

import { describe, expect, it } from 'vitest';

import {
  addPair,
  setClip,
  setDialect,
  setFeedback,
  setPairContrast,
  setScoring,
  setSet,
  setWord,
} from './edits.js';
import { sampleDocument, SAMPLE_PAIR_IDS } from './fixture.js';
import type { IssueCode } from './issues.js';
import { isReady, issues, stepState } from './issues.js';
import type { MinimalPairsContent } from './model.js';
import { emptyContent } from './model.js';

const [P1, P2, , P4] = SAMPLE_PAIR_IDS;
const codes = (ex: MinimalPairsContent): IssueCode[] => issues(ex).map((i) => i.code);

describe('the sample', () => {
  it('is ready, with only the notes of a mixed set and of memory still to come', () => {
    expect(isReady(sampleDocument())).toBe(true);
    expect(codes(sampleDocument())).toEqual(['MP_MIXED_CONTRASTS', 'MP_CONTRAST_CARD_LATER', 'MP_EXPOSURE_LATER']);
  });
});

describe('step 1', () => {
  it('needs a family the pack knows', () => {
    expect(codes({ ...sampleDocument(), language: 'sv' })).toContain('MP_NO_CONTRAST');
    expect(codes({ ...sampleDocument(), contrastId: 'nope' })).toContain('MP_NO_CONTRAST');
  });

  it('needs pairs, and two different words in each', () => {
    expect(codes({ ...sampleDocument(), pairs: [] })).toContain('MP_NO_PAIRS');
    const half = setWord(sampleDocument(), P1, 'w2skja', { text: ' ' });
    expect(issues(half)).toContainEqual(expect.objectContaining({ code: 'MP_PAIR_UNDER_TWO', pairId: P1 }));
    const twice = setWord(sampleDocument(), P1, 'w2skja', { text: 'Kjære' });
    expect(issues(twice)).toContainEqual(expect.objectContaining({ code: 'MP_PAIR_DUPLICATE', pairId: P1 }));
    expect(codes(sampleDocument())).not.toContain('MP_PAIR_DUPLICATE');
  });

  it('warns about a set of one or two ready pairs', () => {
    const ex = { ...sampleDocument(), pairs: sampleDocument().pairs.slice(0, 2) };
    expect(issues(ex)).toContainEqual(expect.objectContaining({ code: 'MP_FEW_PAIRS', ready: 2 }));
  });

  it('notes a pair without meanings, unless meanings are never shown', () => {
    let ex = sampleDocument();
    for (const id of ['w3kjek', 'w4sjek']) ex = setWord(ex, P2, id, { gloss: '' });
    expect(issues(ex)).toContainEqual(expect.objectContaining({ code: 'MP_NO_GLOSS', pairId: P2 }));
    expect(codes(setFeedback(ex, { showGloss: 'never' }))).not.toContain('MP_NO_GLOSS');
  });

  it('does not note glosses on a pair that is still empty', () => {
    expect(codes(addPair(sampleDocument()))).not.toContain('MP_NO_GLOSS');
  });

  it('notes a mixed set, and stays quiet once every pair trains the exercise contrast', () => {
    expect(codes(setPairContrast(sampleDocument(), P4, 'kjsj'))).not.toContain('MP_MIXED_CONTRASTS');
  });
});

describe('step 2', () => {
  it('blocks a word without a recording', () => {
    const ex = setClip(sampleDocument(), P1, 'w1kjar', { assetId: '' });
    expect(issues(ex)).toContainEqual(expect.objectContaining({ code: 'MP_WORD_NO_CLIP', wordId: 'w1kjar' }));
  });

  it('blocks two voices in one pair, and reads a missing voice as its provenance', () => {
    const ex = setClip(sampleDocument(), P1, 'w2skja', { voice: 'Læreren' });
    expect(issues(ex)).toContainEqual(
      expect.objectContaining({ code: 'MP_PAIR_MIXED_VOICES', pairId: P1, voices: ['Ingrid (Oslo)', 'Læreren'] }),
    );
    let unnamed = setClip(sampleDocument(), P1, 'w1kjar', { voice: '' });
    unnamed = setClip(unnamed, P1, 'w2skja', { voice: '' });
    expect(codes(unnamed)).not.toContain('MP_PAIR_MIXED_VOICES');
  });

  it('warns about a long clip and about a length gap above 350 ms', () => {
    const long = setClip(sampleDocument(), P1, 'w1kjar', { durationMs: 2600 });
    expect(codes(long)).toContain('MP_CLIP_TOO_LONG');
    expect(issues(long)).toContainEqual(expect.objectContaining({ code: 'MP_PAIR_LENGTH_SPREAD', spreadMs: 1780 }));
    const close = setClip(sampleDocument(), P1, 'w1kjar', { durationMs: 1170 });
    expect(codes(close)).not.toContain('MP_PAIR_LENGTH_SPREAD'); // 350 exactly
  });

  it('reads the synthesis policy off the pair’s own family', () => {
    // kj/sj — synthesis merges it: blocked.
    const kj = setClip(sampleDocument(), P1, 'w1kjar', { provenance: 'tts' });
    expect(issues(kj)).toContainEqual(expect.objectContaining({ code: 'MP_TTS_BLOCKED', contrastId: 'kjsj', count: 1 }));
    // The fourth pair trains `consonant` inside a kj/sj set — synthesis is allowed there.
    let cons = setClip(sampleDocument(), P4, 'w7kjor', { provenance: 'tts', voice: 'piper' });
    cons = setClip(cons, P4, 'w8kjop', { provenance: 'tts', voice: 'piper' });
    cons = setClip(cons, P4, 'w9kjol', { provenance: 'tts', voice: 'piper' });
    expect(codes(cons)).not.toContain('MP_TTS_BLOCKED');
    expect(issues(cons)).toContainEqual(expect.objectContaining({ code: 'MP_TTS_NOTE', contrastId: 'consonant', count: 3 }));
    // Length — risky.
    const len = setClip({ ...sampleDocument(), contrastId: 'length' }, P1, 'w1kjar', { provenance: 'tts' });
    expect(codes(len)).toContain('MP_TTS_RISKY');
  });

  it('asks for a dialect on a toneme set, and is satisfied once the pair has one', () => {
    const tone = { ...sampleDocument(), contrastId: 'tone' };
    expect(codes(tone)).toContain('MP_DIALECT_MISSING');
    let dialected = tone;
    for (const id of SAMPLE_PAIR_IDS.slice(0, 3)) dialected = setDialect(dialected, id, 'ost');
    expect(codes(dialected)).not.toContain('MP_DIALECT_MISSING');
  });
});

describe('step 3', () => {
  it('warns outside the 8–15 band', () => {
    expect(codes(setSet(sampleDocument(), { probes: 7 }))).toContain('MP_FEW_PROBES');
    expect(codes(setSet(sampleDocument(), { probes: 8 }))).not.toContain('MP_FEW_PROBES');
    expect(codes(setSet(sampleDocument(), { probes: 16 }))).toContain('MP_MANY_PROBES');
    expect(codes(setSet(sampleDocument(), { probes: 15 }))).not.toContain('MP_MANY_PROBES');
  });

  it('blocks a set that cannot be filled without repeats', () => {
    const ex = setSet(sampleDocument(), { allowRepeat: false, probes: 10 });
    expect(issues(ex)).toContainEqual(expect.objectContaining({ code: 'MP_POOL_TOO_SMALL', probes: 10, pool: 9 }));
    expect(codes(setSet(sampleDocument(), { allowRepeat: false, probes: 9 }))).not.toContain('MP_POOL_TOO_SMALL');
  });

  it('warns about unlimited listens and about more than six buttons', () => {
    expect(codes(setSet(sampleDocument(), { playsPerProbe: 0 }))).toContain('MP_UNLIMITED_REPLAYS');
    expect(codes(setSet(sampleDocument(), { options: 'all' }))).toContain('MP_TOO_MANY_OPTIONS');
  });
});

describe('steps 4 and 5', () => {
  it('feedback', () => {
    expect(codes(setFeedback(sampleDocument(), { immediate: false }))).toEqual(
      expect.arrayContaining(['MP_NO_IMMEDIATE']),
    );
    expect(codes(setFeedback(sampleDocument(), { immediate: false }))).not.toContain('MP_NO_AB');
    expect(codes(setFeedback(sampleDocument(), { abCompare: false }))).toContain('MP_NO_AB');
    expect(codes(setFeedback(sampleDocument(), { showSpelling: 'afterAnswer' }))).toContain('MP_SPELLING_HIDDEN');
    expect(
      codes(setSet(setFeedback(sampleDocument(), { showSpelling: 'afterAnswer' }), { options: 'all' })),
    ).not.toContain('MP_SPELLING_HIDDEN');
    expect(codes(setFeedback(sampleDocument(), { secondChance: true }))).toContain('MP_SECOND_CHANCE');
  });

  it('memory and the pass mark', () => {
    expect(codes(setScoring(sampleDocument(), { memory: 'contrast+word' }))).toContain('MP_WORD_MEMORY');
    const none = codes(setScoring(sampleDocument(), { memory: 'none', logWordExposure: false }));
    expect(none).toContain('MP_NO_MEMORY');
    expect(none).not.toContain('MP_CONTRAST_CARD_LATER');
    expect(none).not.toContain('MP_EXPOSURE_LATER');
    expect(codes(setScoring(sampleDocument(), { passPct: 95 }))).toContain('MP_PASS_TOO_HIGH');
    expect(codes(setScoring(sampleDocument(), { passPct: 90 }))).not.toContain('MP_PASS_TOO_HIGH');
  });
});

describe('stepState', () => {
  it('an empty draft: step 1 blocked, step 2 empty, the rest ok', () => {
    const ex = emptyContent('nb', 'kjsj');
    expect(stepState(ex, 1)).toEqual({ s: 'err', errs: 1 }); // the one pair has no words
    expect(stepState(ex, 2)).toEqual({ s: 'ok', errs: 0 });
    expect(stepState(ex, 3)).toEqual({ s: 'ok', errs: 0 });
  });

  it('step 2 is blocked once a word is written and has no clip', () => {
    let ex = emptyContent('nb', 'kjsj');
    ex = setWord(ex, ex.pairs[0]!.id, ex.pairs[0]!.words[0]!.id, { text: 'tak' });
    expect(stepState(ex, 2)).toEqual({ s: 'err', errs: 1 });
  });

  it('the sample: every step ok', () => {
    for (const step of [1, 2, 3, 4, 5] as const) expect(stepState(sampleDocument(), step).s).toBe('ok');
  });
});
