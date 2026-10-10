// What a sitting may move (plan 72 §3.10, Q1-A): the contrast always, the words only under
// `contrast+word`, nothing under `none`.

import { describe, expect, it } from 'vitest';

import { setPairContrast, setScoring } from './edits.js';
import { sampleDocument, SAMPLE_PAIR_IDS } from './fixture.js';
import { atomsForMemory, contrastAtomId, contrastAtoms, ratesWords } from './memory.js';

const atoms = [
  { atomType: 'vocabulary_item', atomId: 'word-1' },
  { atomType: 'grammar_rule_atom', atomId: 'rule-1' },
];

describe('contrastAtomId', () => {
  it('is named by the pack language, whatever the course spells it', () => {
    expect(contrastAtomId('nb', 'kjsj')).toBe('nb:kjsj');
    expect(contrastAtomId('nb-NO', 'kjsj')).toBe('nb:kjsj');
    expect(contrastAtomId('SV', 'kjsj')).toBe('sv:kjsj');
  });
});

describe('contrastAtoms', () => {
  // The sample is a mixed set already: its fourth pair trains `consonant`.
  it('names every family of a mixed set once, the exercise contrast first', () => {
    expect(contrastAtoms(sampleDocument())).toEqual(['nb:kjsj', 'nb:consonant']);
    const ex = setPairContrast(sampleDocument(), SAMPLE_PAIR_IDS[1], 'length');
    expect(contrastAtoms(ex)).toEqual(['nb:kjsj', 'nb:length', 'nb:consonant']);
  });

  it('names one atom for a set of one family', () => {
    const ex = setPairContrast(sampleDocument(), SAMPLE_PAIR_IDS[3], 'kjsj');
    expect(contrastAtoms(ex)).toEqual(['nb:kjsj']);
  });

  it('is empty under none, and leaves out a family the pack does not know', () => {
    expect(contrastAtoms(setScoring(sampleDocument(), { memory: 'none' }))).toEqual([]);
    expect(contrastAtoms({ ...sampleDocument(), contrastId: 'nope' })).toEqual(['nb:consonant']);
  });
});

describe('atomsForMemory', () => {
  it('drops the words under contrast and none', () => {
    expect(ratesWords(sampleDocument())).toBe(false);
    expect(atomsForMemory(sampleDocument(), atoms)).toEqual([atoms[1]]);
    expect(atomsForMemory(setScoring(sampleDocument(), { memory: 'none' }), atoms)).toEqual([atoms[1]]);
  });

  it('keeps them under contrast+word', () => {
    const ex = setScoring(sampleDocument(), { memory: 'contrast+word' });
    expect(ratesWords(ex)).toBe(true);
    expect(atomsForMemory(ex, atoms)).toEqual(atoms);
  });
});
