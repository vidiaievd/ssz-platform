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
import { FillInBlankValidator } from './validators/fill-in-blank.validator.js';
import { MatchPairsValidator } from './validators/match-pairs.validator.js';
import { OrderingValidator } from './validators/ordering.validator.js';
import type { IPerTypeValidator } from './validators/per-type-validator.interface.js';

// Template codes that require human review — not scored by rule-based logic.
const FREE_FORM_CODES = new Set(['translate_to_target', 'translate_from_target']);

@Injectable()
export class SchemaBasedAnswerValidator implements IAnswerValidator {
  // typed as `any` — AJV + ajv-formats have CJS/ESM interop issues with moduleResolution:nodenext;
  // the runtime works correctly (tests confirm); we avoid the unsolvable type error this way.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly ajv: any;
  private readonly validators: Map<string, IPerTypeValidator>;

  constructor(
    mcValidator: MultipleChoiceValidator,
    fibValidator: FillInBlankValidator,
    mpValidator: MatchPairsValidator,
    orderingValidator: OrderingValidator,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.ajv = new (Ajv as any)({ allErrors: true, strict: false });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    (addFormats as any)(this.ajv);

    this.validators = new Map([
      ['multiple_choice', mcValidator],
      ['fill_in_blank', fibValidator],
      ['match_pairs', mpValidator],
      ['ordering', orderingValidator],
    ]);
  }

  async validate(
    input: ValidateAnswerInput,
  ): Promise<Result<ValidationOutcome, ValidationError>> {
    // Step 1 — AJV schema validation
    const validateFn = this.ajv.compile(input.answerSchema as object);
    if (!validateFn(input.submittedAnswer)) {
      const errors = this.ajv.errorsText(validateFn.errors);
      return Result.fail(
        new ValidationError('SCHEMA_MISMATCH', `Answer does not match schema: ${errors}`),
      );
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
      checkSettings: input.checkSettings,
      targetLanguage: input.targetLanguage,
    });
  }
}
