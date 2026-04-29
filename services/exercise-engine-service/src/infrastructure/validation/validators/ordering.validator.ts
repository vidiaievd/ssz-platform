import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface OrderingAnswer {
  ordered_ids: string[];
}

@Injectable()
export class OrderingValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as OrderingAnswer;
    const expected = input.expectedAnswers as OrderingAnswer;

    if (submitted.ordered_ids.length !== expected.ordered_ids.length) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          `Ordering answer length mismatch: submitted ${submitted.ordered_ids.length}, expected ${expected.ordered_ids.length}`,
        ),
      );
    }

    const total = expected.ordered_ids.length;
    const correctPositions = expected.ordered_ids.filter(
      (id, i) => submitted.ordered_ids[i] === id,
    ).length;

    const exactMatch = correctPositions === total;

    const allowPartial = input.checkSettings['allow_partial_credit'] === true;
    const strategy = input.checkSettings['partial_credit_strategy'];

    let score: number;
    if (exactMatch) {
      score = 100;
    } else if (allowPartial && strategy === 'by_position' && total > 0) {
      score = Math.round((100 * correctPositions) / total);
    } else {
      score = 0;
    }

    return Result.ok({
      correct: score === 100,
      score,
      details: {
        correct_positions: correctPositions,
        total_positions: total,
        submitted: submitted.ordered_ids,
        expected: expected.ordered_ids,
      },
      requiresReview: false,
    });
  }
}
