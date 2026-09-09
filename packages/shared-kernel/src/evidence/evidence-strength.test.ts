import { describe, expect, it } from 'vitest';

import { clampByEvidence, evidenceStrength, ratingRank } from './evidence-strength.js';

describe('evidenceStrength', () => {
  describe('the answer form, when the template can describe it', () => {
    it('lets free typing reach the top — nothing narrowed the options', () => {
      expect(evidenceStrength({ answerForm: { mode: 'free', bankSize: null, wordsConsumed: false } }))
        .toEqual({ successCap: 'EASY', failureFloor: 'HARD' });
    });

    it('holds a bank of five to GOOD — the word was on screen', () => {
      expect(evidenceStrength({ answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true } }))
        .toEqual({ successCap: 'GOOD', failureFloor: 'AGAIN' });
    });

    it('holds a bank of two to HARD — that is a coin toss', () => {
      expect(evidenceStrength({ answerForm: { mode: 'bank', bankSize: 2, wordsConsumed: false } })
        .successCap).toBe('HARD');
    });

    it('holds a bank of three to HARD, and four to GOOD', () => {
      const three = { mode: 'bank', bankSize: 3, wordsConsumed: false } as const;
      const four = { mode: 'bank', bankSize: 4, wordsConsumed: false } as const;
      expect(evidenceStrength({ answerForm: three }).successCap).toBe('HARD');
      expect(evidenceStrength({ answerForm: four }).successCap).toBe('GOOD');
    });

    it('reads the form over the template code', () => {
      // word_bank_gap_fill absorbed fill_in_blank, so the same template covers both
      // choosing and typing. If the code won, one of the two would be rated wrongly.
      const typed = evidenceStrength({
        templateCode: 'word_bank_gap_fill',
        answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
      });
      const chosen = evidenceStrength({
        templateCode: 'word_bank_gap_fill',
        answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
      });
      expect(typed.successCap).toBe('EASY');
      expect(chosen.successCap).toBe('GOOD');
    });
  });

  describe('the bank decaying across a block (plan 36 §B.3)', () => {
    const spent = (bankSize: number) =>
      ({ mode: 'bank', bankSize, wordsConsumed: true }) as const;

    it('gives way as the bank is spent — five words over five gaps', () => {
      // By the last gap there is one word left and one place to put it. That is not
      // recall, and it used to earn the same interval as the first gap.
      const caps = [1, 2, 3, 4, 5].map(
        (gapPosition) => evidenceStrength({ answerForm: spent(5), gapPosition }).successCap,
      );
      expect(caps).toEqual(['GOOD', 'GOOD', 'HARD', 'HARD', 'HARD']);
    });

    it('does not decay when words may be reused', () => {
      // Nothing is spent, so the tenth gap faces the same bank as the first.
      const reusable = { mode: 'bank', bankSize: 6, wordsConsumed: false } as const;
      expect(evidenceStrength({ answerForm: reusable, gapPosition: 6 }).successCap).toBe('GOOD');
    });

    it('does not decay free typing — there is no bank to spend', () => {
      const typed = { mode: 'free', bankSize: null, wordsConsumed: true } as const;
      expect(evidenceStrength({ answerForm: typed, gapPosition: 9 }))
        .toEqual({ successCap: 'EASY', failureFloor: 'HARD' });
    });

    it('reads the whole bank when there is no position to place the gap in', () => {
      // Attempts not graded gap by gap report no position, and must rate as before.
      expect(evidenceStrength({ answerForm: spent(5) }).successCap).toBe('GOOD');
      expect(evidenceStrength({ answerForm: spent(5), gapPosition: null }).successCap).toBe('GOOD');
    });

    it('never lets a failure off the floor, however narrow the bank', () => {
      // Getting it wrong with two words left is the strongest signal of not knowing
      // in the whole scale. The decay must not soften that.
      expect(evidenceStrength({ answerForm: spent(5), gapPosition: 5 }).failureFloor).toBe('AGAIN');
    });
  });

  describe('the template, for the types that have no form to report', () => {
    it.each([
      ['short_answer', 'EASY', 'HARD'],
      ['writing_task', 'EASY', 'HARD'],
      ['translate_to_target', 'EASY', 'HARD'],
      ['fill_in_blank', 'EASY', 'HARD'],
      ['error_correction', 'EASY', 'HARD'],
      ['translate_from_target', 'GOOD', 'HARD'],
      ['multiple_choice', 'GOOD', 'AGAIN'],
      ['multiple_choice_group', 'GOOD', 'AGAIN'],
      ['word_bank_fill', 'GOOD', 'AGAIN'],
      ['sentence_schema', 'GOOD', 'AGAIN'],
      ['match_pairs', 'HARD', 'AGAIN'],
      ['text_order', 'HARD', 'AGAIN'],
    ])('rates %s up to %s and down to %s', (templateCode, successCap, failureFloor) => {
      expect(evidenceStrength({ templateCode })).toEqual({ successCap, failureFloor });
    });

    it('covers all twelve types of the audit', () => {
      // The point of a separate plan: one table, settled once, rather than the same
      // question reopened inside twelve per-type plans.
      const audited = [
        'short_answer', 'fill_in_blank', 'multiple_choice', 'match_pairs',
        'writing_task', 'sentence_schema', 'word_bank_fill', 'translate_to_target',
        'multiple_choice_group', 'text_order', 'error_correction', 'translate_from_target',
      ];
      const unclamped = audited.filter(
        (code) =>
          evidenceStrength({ templateCode: code }).successCap === 'EASY' &&
          evidenceStrength({ templateCode: code }).failureFloor === 'AGAIN',
      );
      expect(unclamped).toEqual([]);
    });
  });

  describe('what the scale must not touch', () => {
    it('clamps nothing for an unknown template', () => {
      // A new type rates as it does today until its plan adds a row. Silence must
      // mean "unchanged", never "guessed at".
      expect(evidenceStrength({ templateCode: 'some_future_type' }))
        .toEqual({ successCap: 'EASY', failureFloor: 'AGAIN' });
    });

    it('clamps nothing when neither form nor template is known', () => {
      // Events published before plan 35 §5.4 carry neither, and must keep rating
      // exactly as they did — the scale is additive, not a migration.
      expect(evidenceStrength({})).toEqual({ successCap: 'EASY', failureFloor: 'AGAIN' });
      expect(evidenceStrength({ answerForm: null, templateCode: null }))
        .toEqual({ successCap: 'EASY', failureFloor: 'AGAIN' });
    });
  });

  describe('clampByEvidence', () => {
    const bankOfFive = evidenceStrength({
      answerForm: { mode: 'bank', bankSize: 5, wordsConsumed: true },
    });
    const typed = evidenceStrength({
      answerForm: { mode: 'free', bankSize: null, wordsConsumed: false },
    });
    const unclamped = evidenceStrength({});

    it('brings a success down to the ceiling', () => {
      expect(clampByEvidence('EASY', bankOfFive)).toBe('GOOD');
    });

    it('leaves a success already under the ceiling alone', () => {
      expect(clampByEvidence('HARD', bankOfFive)).toBe('HARD');
      expect(clampByEvidence('GOOD', bankOfFive)).toBe('GOOD');
    });

    it('lifts a failure up to the floor', () => {
      expect(clampByEvidence('AGAIN', typed)).toBe('HARD');
    });

    it('leaves a failure alone where the floor is the bottom', () => {
      expect(clampByEvidence('AGAIN', bankOfFive)).toBe('AGAIN');
    });

    it('never promotes a success or demotes one into a lapse', () => {
      // The clamp only moves a rating toward the middle. A HARD must not become
      // EASY because the form was strong, and a GOOD must not become a lapse.
      expect(clampByEvidence('HARD', typed)).toBe('HARD');
      expect(clampByEvidence('GOOD', typed)).toBe('GOOD');
      for (const rating of ['AGAIN', 'HARD', 'GOOD', 'EASY'] as const) {
        expect(clampByEvidence(rating, unclamped)).toBe(rating);
      }
    });
  });

  describe('ratingRank', () => {
    it('orders the ratings so a ceiling and a floor mean something', () => {
      expect(ratingRank('AGAIN')).toBeLessThan(ratingRank('HARD'));
      expect(ratingRank('HARD')).toBeLessThan(ratingRank('GOOD'));
      expect(ratingRank('GOOD')).toBeLessThan(ratingRank('EASY'));
    });
  });
});
