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
import { WritingTaskValidator } from './validators/writing-task.validator.js';
import type { IPerTypeValidator } from './validators/per-type-validator.interface.js';

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
  // And `writing_task`: its key is the point keywords, the rubric descriptors and an
  // example answer, while its submission is a written text and a set of ticked checklist
  // ids. One schema cannot describe both, and the one that guards the author's document
  // is the one worth keeping strict.
  'writing_task',
  // `short_answer` joined on the rewrite (plan 51): its key is a map of semantic
  // elements per question, its submission a list of typed answers. It is the one entry
  // here with two live document shapes, and the older of them *was* describable by one
  // schema — so its submission shape is now checked in `short-answer-legacy.ts`, where
  // AJV used to check it, rather than nowhere.
  'short_answer',
  // And `sentence_schema` on its own rewrite (plan 52): its key is a map of fields per
  // chunk, its submission a board per sentence. Its shape is checked in the validator.
  'sentence_schema',
  // And `multiple_choice` on its own (plan 53): its key is a correct option id per
  // question with the rebuttals beside it, its submission a list of picks carrying the
  // attempt each was made on. Like `short_answer` it has two live document shapes, and
  // the older of them *was* describable by one schema — so its submission shape is now
  // checked in `multiple-choice-legacy.ts`, where AJV used to check it, rather than
  // nowhere.
  'multiple_choice',
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
    wtValidator: WritingTaskValidator,
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
      ['writing_task', wtValidator],
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

    // Step 2 — Dispatch to per-type validator.
    //
    // There is no free-form bypass left. `writing_task` was the last code routed by
    // membership of a set — no validator, no facts, `details: null` — and it now has a
    // validator of its own that routes for review unconditionally *and* measures the
    // text for the teacher's queue (plan 50). The translate pair left the same set in
    // plan 42, for the opposite reason: its engine can approve a hit on the key.
    //
    // So an unrecognised template is now always an error rather than sometimes a silent
    // route to a human.
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
