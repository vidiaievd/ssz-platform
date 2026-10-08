// The builder's mutations and their limits (plan 72 §4.1).

import { describe, expect, it } from 'vitest';

import {
  addWord,
  clearClip,
  hasPairOf,
  insertFromLibrary,
  relabelVoice,
  removePair,
  removeWord,
  setDialect,
  setPairContrast,
  setPassPct,
  setProbes,
} from './edits.js';
import { sampleDocument, SAMPLE_PAIR_IDS } from './fixture.js';
import { emptyContent } from './model.js';
import { libraryOf } from './packs/index.js';

const [P1, , , P4] = SAMPLE_PAIR_IDS;

describe('pairs and words', () => {
  it('keeps the last pair', () => {
    const one = emptyContent('nb', 'kjsj');
    expect(removePair(one, one.pairs[0]!.id)).toBe(one);
    expect(removePair(sampleDocument(), P1).pairs).toHaveLength(3);
  });

  it('holds two or three words a pair', () => {
    expect(addWord(sampleDocument(), P4).pairs[3]!.words).toHaveLength(3);
    expect(addWord(sampleDocument(), P1).pairs[0]!.words).toHaveLength(3);
    expect(removeWord(sampleDocument(), P1, 'w1kjar').pairs[0]!.words).toHaveLength(2);
    expect(removeWord(sampleDocument(), P4, 'w9kjol').pairs[3]!.words).toHaveLength(2);
  });

  it('clears the override when the exercise contrast is chosen for a pair', () => {
    expect(setPairContrast(sampleDocument(), P4, 'kjsj').pairs[3]!.contrastId).toBe('');
    expect(setPairContrast(sampleDocument(), P1, 'vowel').pairs[0]!.contrastId).toBe('vowel');
  });
});

describe('the library', () => {
  it('has the prototype pairs of the nb pack, words only', () => {
    expect(libraryOf('nb', 'kjsj')[0]).toEqual(['kjære', 'skjære']);
    expect(libraryOf('nb-NO', 'tone')).toEqual([['bønder', 'bønner']]);
    expect(libraryOf('sv', 'kjsj')).toEqual([]);
  });

  it('replaces empty pairs and arrives without audio', () => {
    const ex = insertFromLibrary(emptyContent('nb', 'kjsj'), ['tak', 'takk']);
    expect(ex.pairs).toHaveLength(1);
    expect(ex.pairs[0]!.words.map((w) => [w.text, w.clip.assetId])).toEqual([
      ['tak', ''],
      ['takk', ''],
    ]);
  });

  it('knows what is already in the set', () => {
    expect(hasPairOf(sampleDocument(), ['Kjære', 'skjære'])).toBe(true);
    expect(hasPairOf(sampleDocument(), ['tak', 'takk'])).toBe(false);
  });
});

describe('clips', () => {
  it('relabels only the recorded words of a pair', () => {
    const ex = relabelVoice(clearClip(sampleDocument(), P1, 'w2skja'), P1, 'Læreren', 'teacher');
    expect(ex.pairs[0]!.words.map((w) => [w.clip.voice, w.clip.provenance])).toEqual([
      ['Læreren', 'teacher'],
      ['Ingrid (Oslo)', 'studio'],
    ]);
  });

  it('removes the recording and keeps who made it', () => {
    const w = clearClip(sampleDocument(), P1, 'w1kjar').pairs[0]!.words[0]!;
    expect(w.clip).toMatchObject({ assetId: '', fileName: '', durationMs: 0, voice: 'Ingrid (Oslo)' });
  });

  it('sets one dialect on the whole pair', () => {
    const ex = setDialect(sampleDocument(), P1, 'vest');
    expect(ex.pairs[0]!.words.every((w) => w.clip.dialect === 'vest')).toBe(true);
  });
});

describe('numbers', () => {
  it('clamps probes to 2–30 and the pass mark to 0–100', () => {
    expect(setProbes(sampleDocument(), 1).set.probes).toBe(2);
    expect(setProbes(sampleDocument(), 99).set.probes).toBe(30);
    expect(setProbes(sampleDocument(), Number.NaN).set.probes).toBe(2);
    expect(setPassPct(sampleDocument(), 120).scoring.passPct).toBe(100);
    expect(setPassPct(sampleDocument(), -5).scoring.passPct).toBe(0);
  });
});
