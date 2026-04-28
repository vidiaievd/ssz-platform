import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface Pair {
  left_id: string;
  right_id: string;
}

interface PairsAnswer {
  pairs: Pair[];
}

@Injectable()
export class MatchPairsValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as PairsAnswer;
    const expected = input.expectedAnswers as PairsAnswer;

    // Build a lookup from expected pairs for O(1) checks.
    const expectedSet = new Set<string>(
      expected.pairs.map((p) => `${p.left_id}:${p.right_id}`),
    );

    const pairResults = submitted.pairs.map((p) => ({
      left_id: p.left_id,
      right_id: p.right_id,
      correct: expectedSet.has(`${p.left_id}:${p.right_id}`),
    }));

    const correctCount = pairResults.filter((p) => p.correct).length;
    const totalExpected = expected.pairs.length;

    const score = totalExpected === 0 ? 100 : Math.round((100 * correctCount) / totalExpected);

    return Result.ok({
      correct: score === 100,
      score,
      details: { pairs: pairResults },
      requiresReview: false,
    });
  }
}
