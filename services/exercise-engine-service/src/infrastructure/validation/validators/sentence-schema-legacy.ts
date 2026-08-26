import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';

interface FieldPlacement {
  field_id: string;
  token_ids: string[];
}

interface SentenceSchemaAnswer {
  placements: FieldPlacement[];
}

/**
 * The old `sentence_schema`: one sentence, fields declared inline, an ordered list of
 * token ids per field.
 *
 * Lifted out of the validator unchanged when the template was rewritten to the design
 * handoff (plan 52). It is not deprecated code kept out of sentiment — plan 52 §8 Q3
 * reseeds the first lesson of Norsk B1 and nothing else, so six of the seven exercises
 * are still written this way and stay live until someone decides otherwise. The engine
 * picks between the two by the shape of the document, so this keeps working exactly as it
 * did, and the new grader never sees a document it would read as an empty set.
 *
 * Its own behaviour, unchanged: each field's ordered token list is compared to the
 * expected one, order inside a field always matters, and the score is the share of
 * exactly-correct fields when partial credit is allowed.
 *
 * The one addition is the shape check at the top. It used to be AJV's job — the old
 * template's answer schema described the author's key and the learner's submission
 * equally well — and the rewrite ends that: the new key is a map of fields per chunk, the
 * new submission a board per sentence, so `sentence_schema` joined `OWN_SUBMISSION_SHAPE`
 * and AJV no longer sees either. Checking it here keeps the old path as guarded as it was
 * rather than leaving it guarded nowhere.
 */
export function gradeLegacySentenceSchema(input: {
  submittedAnswer: unknown;
  expectedAnswers: unknown;
  checkSettings: Record<string, unknown>;
}): Result<ValidationOutcome, ValidationError> {
  const submitted = readSubmission(input.submittedAnswer);
  if (submitted === null) {
    return Result.fail(
      new ValidationError(
        'SCHEMA_MISMATCH',
        'Answer must carry `placements`: one { field_id, token_ids } per field',
      ),
    );
  }

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

function readSubmission(submitted: unknown): SentenceSchemaAnswer | null {
  if (typeof submitted !== 'object' || submitted === null) return null;
  const { placements } = submitted as { placements?: unknown };
  if (!Array.isArray(placements)) return null;

  const out: FieldPlacement[] = [];
  for (const raw of placements) {
    if (typeof raw !== 'object' || raw === null) return null;
    const { field_id: fieldId, token_ids: tokenIds } = raw as {
      field_id?: unknown;
      token_ids?: unknown;
    };
    if (typeof fieldId !== 'string') return null;
    if (!Array.isArray(tokenIds) || tokenIds.some((id) => typeof id !== 'string')) return null;
    out.push({ field_id: fieldId, token_ids: tokenIds as string[] });
  }
  return { placements: out };
}
