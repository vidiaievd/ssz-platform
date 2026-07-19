import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface ShortAnswerSubmission {
  text: string;
}

interface ShortAnswerExpected {
  reference_answer: string;
  // Optional exact-match shortcuts for instant auto-grading.
  accepted_answers?: string[];
}

function normalize(s: string, caseSensitive: boolean, trimWhitespace: boolean): string {
  const result = trimWhitespace ? s.trim() : s;
  return caseSensitive ? result : result.toLowerCase();
}

/**
 * Open comprehension answers. If the learner's text matches one of the
 * `accepted_answers` shortcuts, we auto-grade it as correct. Otherwise the
 * answer is routed for human / LLM review (requiresReview), rather than being
 * marked wrong — the reference_answer alone is not enough to score reliably.
 */
@Injectable()
export class ShortAnswerValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as ShortAnswerSubmission;
    const expected = input.expectedAnswers as ShortAnswerExpected;
    const settings = input.checkSettings;

    const caseSensitive = settings['case_sensitive'] === true;
    const trimWhitespace = settings['trim_whitespace'] !== false; // default true

    const normSubmitted = normalize(submitted.text ?? '', caseSensitive, trimWhitespace);
    const accepted = expected.accepted_answers ?? [];

    const autoCorrect =
      normSubmitted.length > 0 &&
      accepted.some((acc) => normalize(acc, caseSensitive, trimWhitespace) === normSubmitted);

    if (autoCorrect) {
      return Result.ok({
        correct: true,
        score: 100,
        details: { matched: 'accepted_answer' },
        requiresReview: false,
      });
    }

    // No exact shortcut matched — defer to review instead of marking wrong.
    return Result.ok({
      correct: false,
      score: 0,
      details: { matched: null },
      requiresReview: true,
    });
  }
}
