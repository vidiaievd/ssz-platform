import {
  evidenceStrength,
  ratingRank,
} from '../../../../../src/modules/srs/domain/evidence-strength.js';

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

  describe('ratingRank', () => {
    it('orders the ratings so a ceiling and a floor mean something', () => {
      expect(ratingRank('AGAIN')).toBeLessThan(ratingRank('HARD'));
      expect(ratingRank('HARD')).toBeLessThan(ratingRank('GOOD'));
      expect(ratingRank('GOOD')).toBeLessThan(ratingRank('EASY'));
    });
  });
});
