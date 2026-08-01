import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface TextOrderAnswer {
  order: string[];
}

interface PositionResult {
  item_id: string;
  expected_index: number;
  submitted_index: number | null;
  correct: boolean;
}

/**
 * Grades an ordering exercise by position: an item counts as correct when the
 * learner placed it where it belongs. Partial credit is the share of items in
 * their own slot, which is what a learner sees when they compare the two
 * sequences — deliberately not an edit-distance or adjacency measure.
 */
@Injectable()
export class TextOrderValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as TextOrderAnswer;
    const expected = input.expectedAnswers as TextOrderAnswer;
    const allowPartial = input.checkSettings['allow_partial_credit'] !== false; // default true

    const submittedOrder = submitted.order ?? [];
    const submittedIndex = new Map<string, number>();
    submittedOrder.forEach((id, i) => {
      // A duplicated id can only occupy one slot; the first wins.
      if (!submittedIndex.has(id)) submittedIndex.set(id, i);
    });

    const positions: PositionResult[] = expected.order.map((id, expectedIdx) => {
      const at = submittedIndex.get(id);
      return {
        item_id: id,
        expected_index: expectedIdx,
        submitted_index: at ?? null,
        correct: at === expectedIdx,
      };
    });

    const correctCount = positions.filter((p) => p.correct).length;
    const totalCount = positions.length;

    let score: number;
    if (totalCount === 0) {
      score = 100;
    } else if (allowPartial) {
      score = Math.round((100 * correctCount) / totalCount);
    } else {
      score = correctCount === totalCount ? 100 : 0;
    }

    // An answer that omits or invents items is never fully correct, even when
    // every item it does place happens to sit right.
    const sameLength = submittedOrder.length === totalCount;

    return Result.ok({
      correct: sameLength && correctCount === totalCount,
      score: sameLength ? score : Math.min(score, 99),
      details: { positions },
      requiresReview: false,
    });
  }
}
