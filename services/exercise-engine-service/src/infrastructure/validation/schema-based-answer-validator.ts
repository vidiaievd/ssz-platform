import { Injectable } from '@nestjs/common';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type {
  IAnswerValidator,
  ValidateAnswerInput,
  ValidationOutcome,
} from '../../shared/application/ports/answer-validator.port.js';
import { ValidationError } from '../../shared/application/ports/answer-validator.port.js';
import { Result } from '../../shared/kernel/result.js';
import { MultipleChoiceValidator } from './validators/multiple-choice.validator.js';
import { MultipleChoiceGroupValidator } from './validators/multiple-choice-group.validator.js';
import { FillInBlankValidator } from './validators/fill-in-blank.validator.js';
import { MatchPairsValidator } from './validators/match-pairs.validator.js';
import { ShortAnswerValidator } from './validators/short-answer.validator.js';
import { SentenceSchemaValidator } from './validators/sentence-schema.validator.js';
import { WordBankFillValidator } from './validators/word-bank-fill.validator.js';
import { WordBankGapFillValidator } from './validators/word-bank-gap-fill.validator.js';
import { TextOrderValidator } from './validators/text-order.validator.js';
import { ErrorCorrectionValidator } from './validators/error-correction.validator.js';
import { TranslateValidator } from './validators/translate.validator.js';
import type { IPerTypeValidator } from './validators/per-type-validator.interface.js';

// Template codes that require human review — not scored by rule-based logic.
//
// The translate pair left in plan 42: its check engine cannot reject either, but it can
// approve a hit on the answer key, and refusing to do even that meant a word-perfect
// translation waited for a teacher alongside an empty one.
const FREE_FORM_CODES = new Set(['writing_task']);

/**
 * Templates whose submission does not share a shape with the author's answer key, so
 * the template's `answer_schema` cannot describe both and AJV has nothing useful to say
 * about the submission here.
 *
 * Every other template arranges for one schema to fit both sides — `fill_in_blank`'s
 * submission carries its typed word in `accepted_answers`, and so on. That trick does
 * not stretch to `word_bank_gap_fill`, whose key is a matrix of explanations and whose
 * submission is a list of placements. Loosening the schema until both fit would leave
 * it describing neither, and would cost content-service the check it runs on save.
 *
 * The shape is checked in the per-type validator instead.
 *
 * `error_correction` joined it for the same reason: its key is a corrected sentence and
 * its submission is a set of word-level edits.
 *
 * So did the translate pair: its key is a set of accepted translations per sentence, and
 * its submission is one typed sentence per item.
 *
 * And `match_pairs`: its key is a matrix of explanations per (pair x wrong half), and
 * its submission is a list of placements.
 */
const OWN_SUBMISSION_SHAPE = new Set([
  'word_bank_gap_fill',
  'error_correction',
  'translate_to_target',
  'translate_from_target',
  'match_pairs',
]);

@Injectable()
export class SchemaBasedAnswerValidator implements IAnswerValidator {
  // typed as `any` — AJV + ajv-formats have CJS/ESM interop issues with moduleResolution:nodenext;
  // the runtime works correctly (tests confirm); we avoid the unsolvable type error this way.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly ajv: any;
  private readonly validators: Map<string, IPerTypeValidator>;

  constructor(
    mcValidator: MultipleChoiceValidator,
    mcgValidator: MultipleChoiceGroupValidator,
    fibValidator: FillInBlankValidator,
    mpValidator: MatchPairsValidator,
    saValidator: ShortAnswerValidator,
    ssValidator: SentenceSchemaValidator,
    wbfValidator: WordBankFillValidator,
    wbgfValidator: WordBankGapFillValidator,
    toValidator: TextOrderValidator,
    ecValidator: ErrorCorrectionValidator,
    trValidator: TranslateValidator,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.ajv = new (Ajv as any)({ allErrors: true, strict: false });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (addFormats as any)(this.ajv);

    this.validators = new Map([
      ['multiple_choice', mcValidator],
      ['multiple_choice_group', mcgValidator],
      ['fill_in_blank', fibValidator],
      ['match_pairs', mpValidator],
      ['short_answer', saValidator],
      ['sentence_schema', ssValidator],
      ['word_bank_fill', wbfValidator],
      ['word_bank_gap_fill', wbgfValidator],
      ['text_order', toValidator],
      ['error_correction', ecValidator],
      ['translate_to_target', trValidator],
      ['translate_from_target', trValidator],
    ]);
  }

  async validate(
    input: ValidateAnswerInput,
  ): Promise<Result<ValidationOutcome, ValidationError>> {
    // Step 1 — AJV schema validation, where the schema describes the submission
    if (!OWN_SUBMISSION_SHAPE.has(input.templateCode)) {
      const validateFn = this.ajv.compile(input.answerSchema as object);
      if (!validateFn(input.submittedAnswer)) {
        const errors = this.ajv.errorsText(validateFn.errors);
        return Result.fail(
          new ValidationError('SCHEMA_MISMATCH', `Answer does not match schema: ${errors}`),
        );
      }
    }

    // Step 2 — Free-form templates: route for human review without scoring
    if (FREE_FORM_CODES.has(input.templateCode)) {
      return Result.ok<ValidationOutcome, ValidationError>({
        correct: false,
        score: 0,
        details: null,
        requiresReview: true,
      });
    }

    // Step 3 — Dispatch to per-type validator
    const validator = this.validators.get(input.templateCode);
    if (!validator) {
      return Result.fail(
        new ValidationError(
          'UNSUPPORTED_TEMPLATE',
          `No validator registered for template: ${input.templateCode}`,
        ),
      );
    }

    return validator.validate({
      submittedAnswer: input.submittedAnswer,
      expectedAnswers: input.expectedAnswers,
      content: input.content,
      templateCode: input.templateCode,
      checkSettings: input.checkSettings,
      targetLanguage: input.targetLanguage,
    });
  }
}
