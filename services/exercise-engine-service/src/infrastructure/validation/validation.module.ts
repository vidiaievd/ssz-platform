import { Global, Module } from '@nestjs/common';
import { ANSWER_VALIDATOR } from '../../shared/application/ports/answer-validator.port.js';
import { SchemaBasedAnswerValidator } from './schema-based-answer-validator.js';
import { MultipleChoiceValidator } from './validators/multiple-choice.validator.js';
import { FillInBlankValidator } from './validators/fill-in-blank.validator.js';
import { MatchPairsValidator } from './validators/match-pairs.validator.js';
import { OrderingValidator } from './validators/ordering.validator.js';

@Global()
@Module({
  providers: [
    MultipleChoiceValidator,
    FillInBlankValidator,
    MatchPairsValidator,
    OrderingValidator,
    SchemaBasedAnswerValidator,
    { provide: ANSWER_VALIDATOR, useExisting: SchemaBasedAnswerValidator },
  ],
  exports: [ANSWER_VALIDATOR],
})
export class ValidationModule {}
