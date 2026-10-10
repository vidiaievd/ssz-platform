import {
  sampleDocument,
  toContent,
  toExpectedAnswers,
  type MinimalPairsContent,
} from '@ssz/shared-kernel/minimal-pairs';
import { minimalPairsViolations } from './minimal-pairs-preflight.js';

// What earns this file: the kernel's blockers reach publication under a template prefix, `info` is
// dropped, and each code is reported once however many pairs trip it.

function exercise(doc: MinimalPairsContent = sampleDocument()) {
  return { id: 'ex-1', content: toContent(doc), expectedAnswers: toExpectedAnswers(doc) };
}

const codesOf = (doc: MinimalPairsContent) =>
  minimalPairsViolations(exercise(doc)).map((v) => [v.ruleCode, v.severity]);

describe('minimalPairsViolations', () => {
  it('passes the finished sample', () => {
    expect(minimalPairsViolations(exercise())).toEqual([]);
  });

  it('blocks a word with no recording and says how many', () => {
    const doc = sampleDocument();
    doc.pairs[0].words[0].clip = { ...doc.pairs[0].words[0].clip, assetId: '' };
    doc.pairs[1].words[1].clip = { ...doc.pairs[1].words[1].clip, assetId: '' };
    const violations = minimalPairsViolations(exercise(doc));
    // A pair without its recordings is not ready, so the short-set warning follows from it.
    expect(violations.map((v) => v.ruleCode)).toEqual([
      'MINIMALPAIRS_MP_WORD_NO_CLIP',
      'MINIMALPAIRS_MP_FEW_PAIRS',
    ]);
    expect(violations[0]).toEqual({
      ruleCode: 'MINIMALPAIRS_MP_WORD_NO_CLIP',
      severity: 'blocker',
      itemType: 'EXERCISE',
      itemId: 'ex-1',
      detail: '2 words have no recording',
    });
  });

  it('blocks an exercise with no pairs', () => {
    const doc = sampleDocument();
    doc.pairs = [];
    expect(codesOf(doc)).toContainEqual(['MINIMALPAIRS_MP_NO_PAIRS', 'blocker']);
  });

  it('blocks a pair read by two voices', () => {
    const doc = sampleDocument();
    doc.pairs[0].words[0].clip = { ...doc.pairs[0].words[0].clip, voice: 'A' };
    doc.pairs[0].words[1].clip = { ...doc.pairs[0].words[1].clip, voice: 'B' };
    expect(codesOf(doc)).toContainEqual(['MINIMALPAIRS_MP_PAIR_MIXED_VOICES', 'blocker']);
  });

  it('reports a warning as a warning', () => {
    const doc = sampleDocument();
    doc.scoring.memory = 'contrast+word';
    expect(codesOf(doc)).toContainEqual(['MINIMALPAIRS_MP_WORD_MEMORY', 'warning']);
  });

  it('drops info: the contrast-card and exposure notes are for the builder', () => {
    const doc = sampleDocument();
    doc.scoring.logWordExposure = true;
    doc.scoring.memory = 'contrast';
    const codes = minimalPairsViolations(exercise(doc)).map((v) => v.ruleCode);
    expect(codes).not.toContain('MINIMALPAIRS_MP_EXPOSURE_LATER');
    expect(codes).not.toContain('MINIMALPAIRS_MP_CONTRAST_CARD_LATER');
  });

  it('does not throw on a column that is not a document', () => {
    expect(() =>
      minimalPairsViolations({ id: 'x', content: null, expectedAnswers: 'junk' }),
    ).not.toThrow();
  });
});
