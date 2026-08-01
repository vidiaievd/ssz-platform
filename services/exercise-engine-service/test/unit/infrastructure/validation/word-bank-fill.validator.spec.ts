import { WordBankFillValidator } from '../../../../src/infrastructure/validation/validators/word-bank-fill.validator.js';

const validator = new WordBankFillValidator();

type Blank = { blank_id: number; accepted_answers: string[]; rationale?: unknown };
type Item = { id: string; blanks: Blank[] };

const run = (
  submittedItems: Item[],
  expectedItems: Item[],
  settings: Record<string, unknown> = {},
) =>
  validator.validate({
    submittedAnswer: { items: submittedItems },
    expectedAnswers: { items: expectedItems },
    checkSettings: settings,
    targetLanguage: 'no',
  });

const expected: Item[] = [
  { id: '1', blanks: [{ blank_id: 1, accepted_answers: ['show off'] }] },
  { id: '2', blanks: [{ blank_id: 1, accepted_answers: ['judge a book by its cover'] }] },
  { id: '3', blanks: [{ blank_id: 1, accepted_answers: ['clicked with', 'clicked'] }] },
];

const pick = (id: string, answer: string): Item => ({
  id,
  blanks: [{ blank_id: 1, accepted_answers: [answer] }],
});

describe('WordBankFillValidator', () => {
  describe('happy path', () => {
    it('scores 100 when every sentence is filled correctly', () => {
      const result = run(
        [pick('1', 'show off'), pick('2', 'judge a book by its cover'), pick('3', 'clicked with')],
        expected,
      );

      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.correct).toBe(true);
      expect(result.value.requiresReview).toBe(false);
    });

    it('accepts any of the accepted answers for a blank', () => {
      const result = run([pick('3', 'clicked')], [expected[2]!]);
      expect(result.value.score).toBe(100);
    });

    it('grades several blanks inside one sentence', () => {
      const twoBlanks: Item[] = [
        {
          id: '1',
          blanks: [
            { blank_id: 1, accepted_answers: ['boast'] },
            { blank_id: 2, accepted_answers: ['warm up to you'] },
          ],
        },
      ];
      const result = run(
        [
          {
            id: '1',
            blanks: [
              { blank_id: 1, accepted_answers: ['boast'] },
              { blank_id: 2, accepted_answers: ['show off'] },
            ],
          },
        ],
        twoBlanks,
      );

      expect(result.value.score).toBe(50);
      expect(result.value.correct).toBe(false);
    });
  });

  describe('partial credit', () => {
    it('scores per blank across sentences by default', () => {
      const result = run(
        [pick('1', 'show off'), pick('2', 'come across as'), pick('3', 'clicked with')],
        expected,
      );
      expect(result.value.score).toBe(67);
      expect(result.value.correct).toBe(false);
    });

    it('is all-or-nothing when allow_partial_credit is false', () => {
      const result = run(
        [pick('1', 'show off'), pick('2', 'come across as'), pick('3', 'clicked with')],
        expected,
        { allow_partial_credit: false },
      );
      expect(result.value.score).toBe(0);
    });
  });

  describe('unanswered blanks', () => {
    it('counts a missing sentence as wrong instead of shrinking the total', () => {
      const result = run([pick('1', 'show off')], expected);

      expect(result.value.score).toBe(33);
      const blanks = (result.value.details as { blanks: Array<{ item_id: string; correct: boolean }> })
        .blanks;
      expect(blanks).toHaveLength(3);
      expect(blanks.filter((b) => b.correct)).toHaveLength(1);
    });

    it('treats an empty pick as wrong, not as a match against an empty answer', () => {
      const result = run([pick('1', '')], [expected[0]!]);
      expect(result.value.score).toBe(0);
    });
  });

  describe('normalisation', () => {
    it('is case-insensitive and trims by default', () => {
      const result = run([pick('1', '  Show Off ')], [expected[0]!]);
      expect(result.value.score).toBe(100);
    });

    it('respects case_sensitive: true', () => {
      const result = run([pick('1', 'Show off')], [expected[0]!], { case_sensitive: true });
      expect(result.value.score).toBe(0);
    });
  });

  describe('rationale', () => {
    it('carries the per-blank rationale into details for post-check feedback', () => {
      const rationale = {
        explanation: 'show off = display something to impress',
        options: [{ text: 'boast', verdict: 'acceptable', note: 'about achievements' }],
      };
      const result = run(
        [pick('1', 'show off')],
        [{ id: '1', blanks: [{ blank_id: 1, accepted_answers: ['show off'], rationale }] }],
      );

      const blanks = (result.value.details as { blanks: Array<{ rationale?: unknown }> }).blanks;
      expect(blanks[0]!.rationale).toEqual(rationale);
    });

    it('omits the rationale key when the exercise has none', () => {
      const result = run([pick('1', 'show off')], [expected[0]!]);
      const blanks = (result.value.details as { blanks: Array<Record<string, unknown>> }).blanks;
      expect(blanks[0]).not.toHaveProperty('rationale');
    });
  });
});
