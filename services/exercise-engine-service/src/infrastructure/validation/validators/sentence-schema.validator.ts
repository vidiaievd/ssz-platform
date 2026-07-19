import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface FieldPlacement {
  field_id: string;
  token_ids: string[];
}

interface SentenceSchemaAnswer {
  placements: FieldPlacement[];
}

/**
 * Norwegian setningsskjema: the learner places sentence tokens into topological
 * fields (Forfelt / Verbal / Midtfelt / Sluttfelt …). Grading is deterministic —
 * each field's ordered token list is compared to the expected placement.
 * Order within a field is significant; score is the share of exactly-correct
 * fields when partial credit is allowed.
 */
@Injectable()
export class SentenceSchemaValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as SentenceSchemaAnswer;
    const expected = input.expectedAnswers as SentenceSchemaAnswer;
    const allowPartial = input.checkSettings['allow_partial_credit'] !== false; // default true

    const submittedMap = new Map<string, string[]>(
      submitted.placements.map((p) => [p.field_id, p.token_ids ?? []]),
    );

    const fieldResults: Array<{ field_id: string; correct: boolean }> = [];
    for (const expectedField of expected.placements) {
      const submittedTokens = submittedMap.get(expectedField.field_id) ?? [];
      const expectedTokens = expectedField.token_ids ?? [];
      const correct =
        submittedTokens.length === expectedTokens.length &&
        expectedTokens.every((id, i) => id === submittedTokens[i]);
      fieldResults.push({ field_id: expectedField.field_id, correct });
    }

    const correctCount = fieldResults.filter((f) => f.correct).length;
    const totalCount = expected.placements.length;

    let score: number;
    if (totalCount === 0) {
      score = 100;
    } else if (allowPartial) {
      score = Math.round((100 * correctCount) / totalCount);
    } else {
      score = correctCount === totalCount ? 100 : 0;
    }

    return Result.ok({
      correct: score === 100,
      score,
      details: { fields: fieldResults },
      requiresReview: false,
    });
  }
}
