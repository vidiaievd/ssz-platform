import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import type { ValidationOutcome, ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

interface BlankEntry {
  blank_id: number;
  accepted_answers: string[];
}

interface FibAnswer {
  blanks: BlankEntry[];
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(s: string, caseSensitive: boolean, trimWhitespace: boolean): string {
  let result = trimWhitespace ? s.trim() : s;
  return caseSensitive ? result : result.toLowerCase();
}

@Injectable()
export class FillInBlankValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submitted = input.submittedAnswer as FibAnswer;
    const expected = input.expectedAnswers as FibAnswer;
    const settings = input.checkSettings;

    const caseSensitive = settings['case_sensitive'] === true;
    const trimWhitespace = settings['trim_whitespace'] !== false; // default true
    const fuzzy = settings['fuzzy'] as { editDistance: number } | undefined;
    const allowPartial = settings['allow_partial_credit'] !== false; // default true

    const expectedMap = new Map<number, BlankEntry>(
      expected.blanks.map((b) => [b.blank_id, b]),
    );

    const blankResults: Array<{ blank_id: number; correct: boolean; submitted: string }> = [];

    for (const submittedBlank of submitted.blanks) {
      const expectedBlank = expectedMap.get(submittedBlank.blank_id);
      if (!expectedBlank) {
        blankResults.push({ blank_id: submittedBlank.blank_id, correct: false, submitted: '' });
        continue;
      }

      const studentAnswer = submittedBlank.accepted_answers[0] ?? '';
      const normSubmitted = normalize(studentAnswer, caseSensitive, trimWhitespace);

      const correct = expectedBlank.accepted_answers.some((acc) => {
        const normAcc = normalize(acc, caseSensitive, trimWhitespace);
        if (normSubmitted === normAcc) return true;
        if (fuzzy != null) {
          return levenshtein(normSubmitted, normAcc) <= fuzzy.editDistance;
        }
        return false;
      });

      blankResults.push({ blank_id: submittedBlank.blank_id, correct, submitted: studentAnswer });
    }

    const correctCount = blankResults.filter((b) => b.correct).length;
    const totalCount = expected.blanks.length;

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
