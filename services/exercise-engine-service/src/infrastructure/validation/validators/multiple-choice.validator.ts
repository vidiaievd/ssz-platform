import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface McAnswer {
  correct_option_ids: string[];
}

@Injectable()
export class MultipleChoiceValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as McAnswer;
    const expected = input.expectedAnswers as McAnswer;

    const submittedSet = new Set(submitted.correct_option_ids);
    const expectedSet = new Set(expected.correct_option_ids);

    const correctSelected = [...submittedSet].filter((id) => expectedSet.has(id));
    const wrongSelected = [...submittedSet].filter((id) => !expectedSet.has(id));
    const exactMatch = correctSelected.length === expectedSet.size && wrongSelected.length === 0;

    const allowPartial = input.checkSettings['allow_partial_credit'] === true;

    let score: number;
    if (exactMatch) {
      score = 100;
    } else if (allowPartial && expectedSet.size > 0) {
      // Penalise wrong picks: each wrong pick cancels one correct pick.
      score = Math.max(
        0,
        Math.round((100 * (correctSelected.length - wrongSelected.length)) / expectedSet.size),
      );
    } else {
      score = 0;
    }

    return Result.ok({
      correct: score === 100,
      score,
      details: {
        correct_selected: correctSelected,
        wrong_selected: wrongSelected,
        expected: [...expectedSet],
      },
      requiresReview: false,
    });
  }
}
