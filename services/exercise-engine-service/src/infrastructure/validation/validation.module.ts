import { Global, Module } from '@nestjs/common';
import { ANSWER_VALIDATOR } from '../../shared/application/ports/answer-validator.port.js';
import { SchemaBasedAnswerValidator } from './schema-based-answer-validator.js';
import { MultipleChoiceValidator } from './validators/multiple-choice.validator.js';
import { FillInBlankValidator } from './validators/fill-in-blank.validator.js';
import { MatchPairsValidator } from './validators/match-pairs.validator.js';
import { ShortAnswerValidator } from './validators/short-answer.validator.js';
import { SentenceSchemaValidator } from './validators/sentence-schema.validator.js';
import { WordBankFillValidator } from './validators/word-bank-fill.validator.js';
import { TextOrderValidator } from './validators/text-order.validator.js';

@Global()
@Module({
  providers: [
    MultipleChoiceValidator,
    FillInBlankValidator,
    MatchPairsValidator,
    ShortAnswerValidator,
    SentenceSchemaValidator,
    WordBankFillValidator,
    TextOrderValidator,
    SchemaBasedAnswerValidator,
    { provide: ANSWER_VALIDATOR, useExisting: SchemaBasedAnswerValidator },
  ],
  exports: [ANSWER_VALIDATOR],
})
export class ValidationModule {}
