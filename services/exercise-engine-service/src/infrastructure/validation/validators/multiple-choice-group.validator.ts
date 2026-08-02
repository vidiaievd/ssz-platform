import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type {
  ValidationOutcome,
  ValidationError,
} from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface ItemEntry {
  id: string;
  correct_option_ids: string[];
  explanation?: string;
}

interface McGroupAnswer {
  items: ItemEntry[];
}

interface ItemResult {
  item_id: string;
  correct: boolean;
  /** What the learner picked; empty when the question was left unanswered. */
  submitted: string[];
  expected: string[];
  explanation?: string;
}

const sameSet = (a: string[], b: string[]): boolean => {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((id) => right.has(id));
};

/**
 * Grades a block of multiple-choice questions checked together: a true/false
 * table, a set of word meanings. Each question is right or wrong on its own —
 * no half credit inside a question, since picking one of two options either
 * matches the key or doesn't — and the block's score is the share of questions
 * answered right. Questions the learner skipped count as wrong, so the score
 * always speaks for the whole block.
 */
@Injectable()
export class MultipleChoiceGroupValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as McGroupAnswer;
    const expected = input.expectedAnswers as McGroupAnswer;
    const allowPartial = input.checkSettings['allow_partial_credit'] !== false; // default true

    const submittedById = new Map(
      (submitted.items ?? []).map((item) => [item.id, item.correct_option_ids ?? []]),
    );

    const itemResults: ItemResult[] = expected.items.map((item) => {
      const picks = submittedById.get(item.id) ?? [];
      return {
        item_id: item.id,
        correct: picks.length > 0 && sameSet(picks, item.correct_option_ids),
        submitted: picks,
        expected: item.correct_option_ids,
        ...(item.explanation ? { explanation: item.explanation } : {}),
      };
    });

    const correctCount = itemResults.filter((r) => r.correct).length;
    const totalCount = itemResults.length;

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
      details: { items: itemResults },
      requiresReview: false,
    });
  }
}
