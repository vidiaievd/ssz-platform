import { jest } from '@jest/globals';
import { SchemaBasedAnswerValidator } from '../../../../src/infrastructure/validation/schema-based-answer-validator.js';
import { MultipleChoiceValidator } from '../../../../src/infrastructure/validation/validators/multiple-choice.validator.js';
import { MultipleChoiceGroupValidator } from '../../../../src/infrastructure/validation/validators/multiple-choice-group.validator.js';
import { FillInBlankValidator } from '../../../../src/infrastructure/validation/validators/fill-in-blank.validator.js';
import { MatchPairsValidator } from '../../../../src/infrastructure/validation/validators/match-pairs.validator.js';
import { ShortAnswerValidator } from '../../../../src/infrastructure/validation/validators/short-answer.validator.js';
import { ErrorCorrectionValidator } from '../../../../src/infrastructure/validation/validators/error-correction.validator.js';
import { TranslateValidator } from '../../../../src/infrastructure/validation/validators/translate.validator.js';
import { WritingTaskValidator } from '../../../../src/infrastructure/validation/validators/writing-task.validator.js';
import { TextOrderValidator } from '../../../../src/infrastructure/validation/validators/text-order.validator.js';
import { WordBankFillValidator } from '../../../../src/infrastructure/validation/validators/word-bank-fill.validator.js';
import { WordBankGapFillValidator } from '../../../../src/infrastructure/validation/validators/word-bank-gap-fill.validator.js';
import { SentenceSchemaValidator } from '../../../../src/infrastructure/validation/validators/sentence-schema.validator.js';
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
    new MultipleChoiceGroupValidator(),
    new FillInBlankValidator(),
    new MatchPairsValidator(),
    new ShortAnswerValidator(),
    new SentenceSchemaValidator(),
    new WordBankFillValidator(),
    new WordBankGapFillValidator(),
    new TextOrderValidator(),
    new ErrorCorrectionValidator(),
    new TranslateValidator(),
    new WritingTaskValidator(),
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

    // Checked by the legacy multiple-choice reader rather than by AJV since plan 53:
    // the template joined `OWN_SUBMISSION_SHAPE`, and the shape its old form still has
    // is now guarded where AJV used to guard it rather than nowhere.
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

  // The translate pair used to live here, routing every answer — a word-perfect one
  // included — to a teacher. It has its own validator now, and reaches it without AJV:
  // the template's answer schema describes the author's key, not a list of typed
  // sentences.
  describe('translate templates', () => {
    const translateContent = {
      dir: 'to_target',
      format: 'set',
      items: [{ id: 's1', dir: 'to_target', source: 'Я живу в Тромсё.' }],
    };
    const translateKey = { items: { s1: { refs: ['Jeg bor i Tromsø.'] } } };

    it('approves a hit on the key instead of asking for a teacher', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'translate_to_target',
        answerSchema: { type: 'object', required: ['items'] },
        expectedAnswers: translateKey,
        content: translateContent,
        submittedAnswer: { answers: [{ itemId: 's1', text: 'Jeg bor i Tromsø.' }] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.requiresReview).toBe(false);
      expect(result.value.score).toBe(100);
    });

    it('routes anything short of a hit, for translate_from_target too', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'translate_from_target',
        answerSchema: { type: 'object', required: ['items'] },
        expectedAnswers: { items: { s1: { refs: ['Я живу в Тромсё.'] } } },
        content: {
          dir: 'from_target',
          format: 'set',
          items: [{ id: 's1', dir: 'from_target', source: 'Jeg bor i Tromsø.' }],
        },
        submittedAnswer: { answers: [{ itemId: 's1', text: 'Я проживаю в Тромсё.' }] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.requiresReview).toBe(true);
      expect(result.value.score).toBe(0);
    });
  });

  describe('free-form template routing', () => {
    it('routes writing_task for review through its own validator, with the facts attached', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'writing_task',
        // Describes the author's key, not the submission — writing_task is in
        // OWN_SUBMISSION_SHAPE, so AJV never sees the student's text.
        answerSchema: { type: 'object', required: ['model'] },
        expectedAnswers: { points: { p1: { keywords: ['jeg mener'] } }, model: 'Et eksempel.' },
        content: {
          prompt: 'Si din mening.',
          points: [{ id: 'p1', text: 'Si hva du mener', required: true }],
          rubric: [{ id: 'c1', name: 'Oppgaveløsning', weight: 1, metric: 'points' }],
          settings: { minWords: 3, maxWords: 0 },
        },
        submittedAnswer: { text: 'Jeg mener at dette er viktig.', ticked: ['p1'] },
        checkSettings: {},
        targetLanguage: 'no',
      });

      expect(result.isOk).toBe(true);
      expect(result.value.requiresReview).toBe(true);
      expect(result.value.score).toBe(0);
      // The part that did not exist while the code sat in FREE_FORM_CODES.
      expect(result.value.details).toMatchObject({ wordCount: 6, hitCount: 1, neededCount: 1 });
    });
  });

  describe('unsupported template', () => {
    it('returns UNSUPPORTED_TEMPLATE error for unknown template code', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'ordering', // not registered
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

    it('delegates multiple_choice_group and grades the block per question', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'multiple_choice_group',
        answerSchema: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'correct_option_ids'],
                properties: {
                  id: { type: 'string' },
                  correct_option_ids: { type: 'array', items: { type: 'string' } },
                  explanation: { type: 'string' },
                },
              },
            },
          },
        },
        expectedAnswers: {
          items: [
            { id: '1', correct_option_ids: ['r'] },
            { id: '2', correct_option_ids: ['g'] },
          ],
        },
        submittedAnswer: {
          items: [
            { id: '1', correct_option_ids: ['r'] },
            { id: '2', correct_option_ids: ['r'] },
          ],
        },
        checkSettings: { allow_partial_credit: true },
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(50);
      expect(result.value.correct).toBe(false);
      expect(result.value.requiresReview).toBe(false);
    });

    it('delegates short_answer to ShortAnswerValidator using the real seeded answerSchema', async () => {
      // Regression test: the seeded schema used to require `reference_answer`
      // (the author's expectedAnswers shape), which every real student
      // submission `{ text }` failed against with SCHEMA_MISMATCH before
      // ShortAnswerValidator ever ran — fixed to `anyOf` so either shape
      // passes (content-service/prisma/seed.ts, short_answer.answerSchema).
      const shortAnswerSchema = {
        type: 'object',
        anyOf: [{ required: ['text'] }, { required: ['reference_answer'] }],
        properties: {
          text: { type: 'string' },
          reference_answer: { type: 'string' },
          accepted_answers: { type: 'array', items: { type: 'string' } },
          rubric: { type: 'string' },
          explanation: { type: 'string' },
        },
      };
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'short_answer',
        answerSchema: shortAnswerSchema,
        expectedAnswers: { reference_answer: 'Hun hørte det på radio.', accepted_answers: ['på radio'] },
        submittedAnswer: { text: 'på radio' },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.correct).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.requiresReview).toBe(false);
    });

    it('delegates match_pairs to MatchPairsValidator without checking it against AJV', async () => {
      const validator = makeValidator();
      const result = await validator.validate({
        templateCode: 'match_pairs',
        // The template's answer schema describes the author's feedback matrix, and the
        // submission is a list of placements. AJV would reject the submission against
        // this schema, so `match_pairs` is in OWN_SUBMISSION_SHAPE and never reaches it.
        answerSchema: {
          type: 'object',
          required: ['feedback'],
          properties: { feedback: { type: 'object' } },
        },
        content: {
          variant: 'halves',
          settings: { distractors: true, shuffle: true, showRemaining: true },
          pairs: [
            { id: 'p1', rightId: 'h2', left: 'Hvis det regner i morgen,', right: 'blir vi hjemme.' },
          ],
          distractors: [{ id: 'h1', text: 'vi blir hjemme.' }],
        },
        expectedAnswers: { feedback: { p1: { def: 'Inversjon etter leddsetning.', why: '', ov: {} } } },
        submittedAnswer: { placements: [{ pairId: 'p1', rightId: 'h2' }] },
        checkSettings: {},
        targetLanguage: 'no',
      });
      expect(result.isOk).toBe(true);
      expect(result.value.score).toBe(100);
    });
  });
});
