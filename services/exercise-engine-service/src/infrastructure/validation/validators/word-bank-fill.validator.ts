import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

// Post-check teaching aid; identical in shape to fill_in_blank's rationale.
// Presentational only — it never affects correct/score.
interface BlankRationale {
  explanation?: string;
  options?: Array<{
    text: string;
    verdict: 'correct' | 'acceptable' | 'wrong';
    note?: string;
  }>;
}

interface BlankEntry {
  blank_id: number;
  accepted_answers: string[];
  rationale?: BlankRationale;
}

interface ItemEntry {
  id: string;
  blanks: BlankEntry[];
}

interface WordBankFillAnswer {
  items: ItemEntry[];
}

interface BlankResult {
  item_id: string;
  blank_id: number;
  correct: boolean;
  submitted: string;
  rationale?: BlankRationale;
}

function normalize(s: string, caseSensitive: boolean, trimWhitespace: boolean): string {
  const result = trimWhitespace ? s.trim() : s;
  return caseSensitive ? result : result.toLowerCase();
}

/**
 * Grades a shared-word-bank gap-fill: every blank of every sentence is compared
 * against its accepted answers. Blanks the learner left out count as wrong, so
 * the score always reflects the whole exercise rather than what was attempted.
 */
@Injectable()
export class WordBankFillValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as WordBankFillAnswer;
    const expected = input.expectedAnswers as WordBankFillAnswer;
    const settings = input.checkSettings;

    const caseSensitive = settings['case_sensitive'] === true;
    const trimWhitespace = settings['trim_whitespace'] !== false; // default true
    const allowPartial = settings['allow_partial_credit'] !== false; // default true

    // item id → blank id → learner's pick
    const submittedMap = new Map<string, Map<number, string>>();
    for (const item of submitted.items ?? []) {
      submittedMap.set(
        item.id,
        new Map((item.blanks ?? []).map((b) => [b.blank_id, b.accepted_answers[0] ?? ''])),
      );
    }

    const blankResults: BlankResult[] = [];

    for (const expectedItem of expected.items) {
      const submittedBlanks = submittedMap.get(expectedItem.id);
      for (const expectedBlank of expectedItem.blanks) {
        const answer = submittedBlanks?.get(expectedBlank.blank_id) ?? '';
        const normSubmitted = normalize(answer, caseSensitive, trimWhitespace);
        const correct =
          answer !== '' &&
          expectedBlank.accepted_answers.some(
            (acc) => normalize(acc, caseSensitive, trimWhitespace) === normSubmitted,
          );

        blankResults.push({
          item_id: expectedItem.id,
          blank_id: expectedBlank.blank_id,
          correct,
          submitted: answer,
          ...(expectedBlank.rationale ? { rationale: expectedBlank.rationale } : {}),
        });
      }
    }

    const correctCount = blankResults.filter((b) => b.correct).length;
    const totalCount = blankResults.length;

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
      details: { blanks: blankResults },
      requiresReview: false,
    });
  }
}
