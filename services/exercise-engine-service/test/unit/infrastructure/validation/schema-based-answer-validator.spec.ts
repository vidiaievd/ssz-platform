import { jest } from '@jest/globals';
import { SchemaBasedAnswerValidator } from '../../../../src/infrastructure/validation/schema-based-answer-validator.js';
import { MultipleChoiceValidator } from '../../../../src/infrastructure/validation/validators/multiple-choice.validator.js';
import { FillInBlankValidator } from '../../../../src/infrastructure/validation/validators/fill-in-blank.validator.js';
import { MatchPairsValidator } from '../../../../src/infrastructure/validation/validators/match-pairs.validator.js';
import { OrderingValidator } from '../../../../src/infrastructure/validation/validators/ordering.validator.js';
import { ValidationError } from '../../../../src/shared/application/ports/answer-validator.port.js';
import { Result } from '../../../../src/shared/kernel/result.js';

const mcAnswerSchema = {
  type: 'object',
  required: ['correct_option_ids'],
  properties: {
    correct_option_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
};

const makeValidator = () =>
  new SchemaBasedAnswerValidator(
    new MultipleChoiceValidator(),
    new FillInBlankValidator(),
    new MatchPairsValidator(),
    new OrderingValidator(),
  );

describe('SchemaBasedAnswerValidator', () => {
  describe('AJV schema validation', () => {
    it('returns SCHEMA_MISMATCH error when submitted answer is missing required field', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'multiple_choice',
        answerSchema: mcAnswerSchema,
        expectedAnswers: { correct_option_ids: ['A'] },
        submittedAnswer: { wrong_field: 'B' }, // missing correct_option_ids
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isFail).toBe(true);
      expect(result.error).toBeInstanceOf(ValidationError);
      expect((result.error as ValidationError).code).toBe('SCHEMA_MISMATCH');
    });

    it('returns SCHEMA_MISMATCH when submitted answer has wrong type', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'multiple_choice',
        answerSchema: mcAnswerSchema,
        expectedAnswers: { correct_option_ids: ['A'] },
        submittedAnswer: { correct_option_ids: 'A' }, // should be array
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isFail).toBe(true);
      expect((result.error as ValidationError).code).toBe('SCHEMA_MISMATCH');
    });

    it('returns SCHEMA_MISMATCH when submitted answer is empty array (minItems: 1)', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'multiple_choice',
        answerSchema: mcAnswerSchema,
        expectedAnswers: { correct_option_ids: ['A'] },
        submittedAnswer: { correct_option_ids: [] }, // minItems 1 violated
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isFail).toBe(true);
      expect((result.error as ValidationError).code).toBe('SCHEMA_MISMATCH');
    });
  });

  describe('free-form template routing', () => {
    const freeFormSchema = {
      type: 'object',
      required: ['accepted_translations'],
      properties: {
        accepted_translations: { type: 'array', items: { type: 'string' }, minItems: 1 },
      },
    };

    it('returns requiresReview=true for translate_to_target', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'translate_to_target',
        answerSchema: freeFormSchema,
        expectedAnswers: { accepted_translations: ['god dag'] },
        submittedAnswer: { accepted_translations: ['good day'] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.requiresReview).toBe(true);
      expect(result.value.score).toBe(0);
    });

    it('returns requiresReview=true for translate_from_target', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'translate_from_target',
        answerSchema: freeFormSchema,
        expectedAnswers: { accepted_translations: ['good day'] },
        submittedAnswer: { accepted_translations: ['good day'] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.requiresReview).toBe(true);
    });
  });

  describe('unsupported template', () => {
    it('returns UNSUPPORTED_TEMPLATE error for unknown template code', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'unknown_template',
        answerSchema: { type: 'object' },
        expectedAnswers: {},
        submittedAnswer: {},
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isFail).toBe(true);
      expect((result.error as ValidationError).code).toBe('UNSUPPORTED_TEMPLATE');
    });
  });

  describe('delegation to per-type validators', () => {
    it('delegates multiple_choice to MultipleChoiceValidator and returns its result', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'multiple_choice',
        answerSchema: mcAnswerSchema,
        expectedAnswers: { correct_option_ids: ['A'] },
        submittedAnswer: { correct_option_ids: ['A'] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.requiresReview).toBe(false);
    });

    it('delegates ordering to OrderingValidator', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'ordering',
        answerSchema: {
          type: 'object',
          required: ['ordered_ids'],
          properties: {
            ordered_ids: { type: 'array', items: { type: 'string' } },
          },
        },
        expectedAnswers: { ordered_ids: ['a', 'b', 'c'] },
        submittedAnswer: { ordered_ids: ['a', 'b', 'c'] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.requiresReview).toBe(false);
    });

    it('delegates match_pairs to MatchPairsValidator', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'match_pairs',
        answerSchema: {
          type: 'object',
          required: ['pairs'],
          properties: {
            pairs: {
              type: 'array',
              items: {
                type: 'object',
                required: ['left_id', 'right_id'],
                properties: {
                  left_id: { type: 'string' },
                  right_id: { type: 'string' },
                },
              },
            },
          },
        },
        expectedAnswers: { pairs: [{ left_id: 'a', right_id: '1' }] },
        submittedAnswer: { pairs: [{ left_id: 'a', right_id: '1' }] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
    });
  });
});
