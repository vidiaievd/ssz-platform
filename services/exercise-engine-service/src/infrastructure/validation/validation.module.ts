import { Global, Module } from '@nestjs/common';
import { ANSWER_VALIDATOR } from '../../shared/application/ports/answer-validator.port.js';
import { SchemaBasedAnswerValidator } from './schema-based-answer-validator.js';
import { MultipleChoiceValidator } from './validators/multiple-choice.validator.js';
import { MultipleChoiceGroupValidator } from './validators/multiple-choice-group.validator.js';
import { FillInBlankValidator } from './validators/fill-in-blank.validator.js';
import { MatchPairsValidator } from './validators/match-pairs.validator.js';
import { ShortAnswerValidator } from './validators/short-answer.validator.js';
import { SentenceSchemaValidator } from './validators/sentence-schema.validator.js';
import { WordBankFillValidator } from './validators/word-bank-fill.validator.js';
import { TextOrderValidator } from './validators/text-order.validator.js';
import { ErrorCorrectionValidator } from './validators/error-correction.validator.js';

@Global()
@Module({
  providers: [
    MultipleChoiceValidator,
    MultipleChoiceGroupValidator,
    FillInBlankValidator,
    MatchPairsValidator,
    ShortAnswerValidator,
    SentenceSchemaValidator,
    WordBankFillValidator,
    TextOrderValidator,
    ErrorCorrectionValidator,
    SchemaBasedAnswerValidator,
    { provide: ANSWER_VALIDATOR, useExisting: SchemaBasedAnswerValidator },
  ],
  exports: [ANSWER_VALIDATOR],
})
export class ValidationModule {}
