import { RuleBasedFeedbackGenerator } from '../../../../src/infrastructure/feedback/rule-based-feedback-generator.js';
import type { FeedbackInput } from '../../../../src/shared/application/ports/feedback-generator.port.js';

const generator = new RuleBasedFeedbackGenerator();

const baseInput = (overrides: Partial<FeedbackInput> = {}): FeedbackInput => ({
  templateCode: 'multiple_choice',
  correct: false,
  score: 0,
  validationDetails: null,
  exerciseDefinition: null,
  locale: 'no',
  ...overrides,
});

describe('RuleBasedFeedbackGenerator', () => {
  describe('correct answer', () => {
    it('returns "Correct!" when no successMessage configured', async () => {
      const result = await generator.generate(baseInput({ correct: true, score: 100 }));
      expect(result.isOk).toBe(true);
      expect(result.value.summary).toBe('Correct!');
    });

    it('returns custom successMessage from checkSettings', async () => {
      const result = await generator.generate(
        baseInput({
          correct: true,
          score: 100,
          exerciseDefinition: {
            template: { defaultCheckSettings: { successMessage: 'Flott jobbet!' } },
          },
        }),
      );
      expect(result.value.summary).toBe('Flott jobbet!');
    });

    it('exercise answerCheckSettings overrides template successMessage', async () => {
      const result = await generator.generate(
        baseInput({
          correct: true,
          score: 100,
          exerciseDefinition: {
            template: { defaultCheckSettings: { successMessage: 'Good!' } },
            exercise: { answerCheckSettings: { successMessage: 'Perfect!' } },
          },
        }),
      );
      expect(result.value.summary).toBe('Perfect!');
    });
  });

  describe('incorrect answer — generic fallback', () => {
    it('returns generic message when no definition provided', async () => {
      const result = await generator.generate(baseInput());
      expect(result.isOk).toBe(true);
      expect(result.value.summary).toBe('Incorrect. Please try again.');
    });

    it('includes correct answer for multiple_choice', async () => {
      const result = await generator.generate(
        baseInput({
          exerciseDefinition: {
            exercise: {
              expectedAnswers: { correct_option_ids: ['A', 'B'] },
            },
          },
        }),
      );
      expect(result.value.summary).toBe('Incorrect. Expected: A, B');
      expect(result.value.correctAnswer).toBe('A, B');
    });

    it('includes correct answer for fill_in_blank', async () => {
      const result = await generator.generate(
        baseInput({
          templateCode: 'fill_in_blank',
          exerciseDefinition: {
            exercise: {
              expectedAnswers: {
                blanks: [
                  { accepted_answers: ['hei'] },
                  { accepted_answers: ['farvel'] },
                ],
              },
            },
          },
        }),
      );
      expect(result.value.correctAnswer).toBe('hei / farvel');
    });

    it('includes correct pairs for match_pairs', async () => {
      const result = await generator.generate(
        baseInput({
          templateCode: 'match_pairs',
          exerciseDefinition: {
            exercise: {
              expectedAnswers: {
                pairs: [
                  { left_id: 'cat', right_id: 'katt' },
                  { left_id: 'dog', right_id: 'hund' },
                ],
              },
            },
          },
        }),
      );
      expect(result.value.correctAnswer).toBe('cat → katt, dog → hund');
    });
  });

  describe('hintTemplate', () => {
    it('fills {{placeholders}} from validationDetails', async () => {
      const result = await generator.generate(
        baseInput({
          validationDetails: { expected: 'hei', submitted: 'hey' },
          exerciseDefinition: {
            template: {
              defaultCheckSettings: {
                hintTemplate: 'You wrote "{{submitted}}", but the answer is "{{expected}}".',
              },
            },
          },
        }),
      );
      expect(result.value.summary).toBe(
        'You wrote "hey", but the answer is "hei".',
      );
    });

    it('leaves unknown placeholders as-is when validationDetails is null', async () => {
      const result = await generator.generate(
        baseInput({
          validationDetails: null,
          exerciseDefinition: {
            template: {
              defaultCheckSettings: { hintTemplate: 'Hint: {{clue}}' },
            },
          },
        }),
      );
      expect(result.value.summary).toBe('Hint: {{clue}}');
    });
  });

  describe('locale fallback', () => {
    it('uses instruction hint for requested locale', async () => {
      const result = await generator.generate(
        baseInput({
          locale: 'no',
          exerciseDefinition: {
            instructions: [
              { language: 'en', hint: 'English hint' },
              { language: 'no', hint: 'Norsk hint' },
            ],
          },
        }),
      );
      expect(result.value.summary).toBe('Norsk hint');
    });

    it('falls back to English when requested locale is not found', async () => {
      const result = await generator.generate(
        baseInput({
          locale: 'de',
          exerciseDefinition: {
            instructions: [
              { language: 'en', hint: 'English hint' },
              { language: 'no', hint: 'Norsk hint' },
            ],
          },
        }),
      );
      expect(result.value.summary).toBe('English hint');
    });

    it('falls back to first available when no locale or English match', async () => {
      const result = await generator.generate(
        baseInput({
          locale: 'de',
          exerciseDefinition: {
            instructions: [{ language: 'fr', hint: 'Indice' }],
          },
        }),
      );
      expect(result.value.summary).toBe('Indice');
    });
  });
});
