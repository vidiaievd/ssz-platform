import { describe, expect, it } from 'vitest';

import { atomEvidenceStrength, strongerClaim } from './atom-evidence.js';
import type { AtomRole } from './atom-evidence.js';
import { clampByEvidence } from './evidence-strength.js';
import type { ReviewRatingValue } from './evidence-strength.js';

/**
 * Typed rather than `as const`: `strongerClaim` is generic over one claim shape, and two
 * arguments frozen to their own literals cannot be the same `T`.
 */
type Claim = { role: AtomRole; rating: ReviewRatingValue };

const FREE = { mode: 'free', bankSize: null, wordsConsumed: false } as const;
const BANK_OF_FIVE = { mode: 'bank', bankSize: 5, wordsConsumed: true } as const;

describe('atomEvidenceStrength', () => {
  describe('the role the author gave the atom', () => {
    it('reads a focus atom exactly as the form reads the answer', () => {
      expect(atomEvidenceStrength({ role: 'focus', answerForm: FREE })).toEqual({
        successCap: 'EASY',
        failureFloor: 'HARD',
      });
    });

    it('flattens a context atom in both directions, whatever the form', () => {
      expect(atomEvidenceStrength({ role: 'context', answerForm: FREE })).toEqual({
        successCap: 'HARD',
        failureFloor: 'HARD',
      });
    });

    it('does not let a failed exercise punish the word that was only in the sentence', () => {
      const strength = atomEvidenceStrength({ role: 'context', answerForm: BANK_OF_FIVE });
      expect(clampByEvidence('AGAIN', strength)).toBe('HARD');
    });
  });

  describe('the modality, beside the form', () => {
    it('caps a recognised atom below the top even where the form says nothing', () => {
      expect(atomEvidenceStrength({ role: 'focus', modality: 'recognition' })).toEqual({
        successCap: 'GOOD',
        failureFloor: 'AGAIN',
      });
    });

    it('holds a produced atom off the floor on failure — it may be a misspelling', () => {
      expect(atomEvidenceStrength({ role: 'focus', modality: 'production' })).toEqual({
        successCap: 'EASY',
        failureFloor: 'HARD',
      });
    });

    it('believes the cautious half of each axis when the two disagree', () => {
      // A bank on screen (cap GOOD, floor AGAIN) described as recall (cap EASY, floor HARD).
      expect(
        atomEvidenceStrength({ role: 'focus', modality: 'recall', answerForm: BANK_OF_FIVE }),
      ).toEqual({ successCap: 'GOOD', failureFloor: 'HARD' });
    });

    it('leaves the form alone when the modality is unknown', () => {
      expect(atomEvidenceStrength({ role: 'focus', modality: 'unknown', answerForm: FREE })).toEqual(
        atomEvidenceStrength({ role: 'focus', answerForm: FREE }),
      );
    });
  });

  it('falls back to the template when there is no form, as the exercise scale does', () => {
    expect(atomEvidenceStrength({ role: 'focus', templateCode: 'match_pairs' }).successCap).toBe(
      'HARD',
    );
  });
});

describe('strongerClaim', () => {
  it('prefers the item that examined the atom over the one that merely needed it', () => {
    const focus: Claim = { role: 'focus', rating: 'EASY' };
    const context: Claim = { role: 'context', rating: 'AGAIN' };
    expect(strongerClaim(focus, context)).toBe(focus);
    expect(strongerClaim(context, focus)).toBe(focus);
  });

  it('keeps the worse of two equal claims — a lapse is the informative half', () => {
    const good: Claim = { role: 'focus', rating: 'GOOD' };
    const again: Claim = { role: 'focus', rating: 'AGAIN' };
    expect(strongerClaim(good, again)).toBe(again);
    expect(strongerClaim(again, good)).toBe(again);
  });
});
