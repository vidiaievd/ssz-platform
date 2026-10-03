import { Injectable } from '@nestjs/common';
import { check, fromPersisted } from '@ssz/shared-kernel/sort-into-buckets';
import type { Placement } from '@ssz/shared-kernel/sort-into-buckets';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/**
 * Grades `sort_into_buckets`: every placement on the board at once (plan 66).
 *
 * The board is checked whole, like a `multiple_choice_group` table, and the mechanics are
 * that type's: one `Sjekk` decides the score, which tiles lock, whether the board closes and
 * how much of the key the student may see — all of it the kernel's `check`. This file gets
 * the inputs right, and three of them are facts about the attempt that the submit handler
 * writes over the submission before this runs:
 *
 *   * **which check this is** — the budget (`settings.attempts`) lives on the attempt;
 *   * **which items are locked** — a tile found right stays right, whatever is resent;
 *   * **where each item was on the first check** (`firstAnswers`) — the score is
 *     first-check accuracy over every item (SPEC_api_contract §Grading, plan 66 Q5-A), and
 *     each check writes it forward so a re-check cannot overwrite it.
 *
 * The details reuse `multiple_choice_group`'s field names for exactly those three — `itemId`,
 * `firstAnswer`, `locked`, `closed` — because the handler reads them back between checks,
 * and one reader is better than two that agree.
 *
 * `passed` is returned because the pass mark is `settings.threshold` on the document. A
 * reveal fails the attempt (AC-S8); the score stays what the first check made it.
 *
 * Nothing routes to a teacher: the verdict is a membership test per item.
 */
@Injectable()
export class SortIntoBucketsValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submission = readSubmission(input.submittedAnswer);
    if (submission === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be `{ placements: [{ itemId, bucketId }] }` — one entry per placed item',
        ),
      );
    }

    const document = fromPersisted(input.content, input.expectedAnswers);
    const result = check({
      ex: document,
      placements: submission.placements,
      attempt: submission.attempt,
      reveal: submission.reveal,
      locked: submission.locked,
      // Absent on the first check, so that this check becomes the first.
      ...(submission.attempt > 1 ? { firstBuckets: submission.firstAnswers } : {}),
    });

    if (result.total === 0) {
      return Result.fail(new ValidationError('INVALID_EXERCISE', 'Exercise has no ready items'));
    }

    return Result.ok<ValidationOutcome, ValidationError>({
      correct: result.correctNow === result.total,
      score: result.pct,
      passed: result.passed,
      details: {
        totalItems: result.total,
        /** Right on the first check — what the score counts. */
        passedItems: result.correct,
        /** Right now — the summary line «K av T riktige». */
        correctNow: result.correctNow,
        attempt: result.attempt,
        /** Null for unlimited. */
        checksLeft: result.checksLeft,
        closed: result.closed,
        revealed: result.revealed,
        locked: result.locked,
        // Each bucket's rule — only once the board is closed under `revealKey`.
        rules: result.rules,
        items: result.items.map((item) => ({
          itemId: item.itemKey,
          chosenBucketId: item.chosenBucketId,
          correct: item.ok,
          firstCorrect: item.firstOk,
          /** Where the item was on the first check, carried forward by the handler. */
          firstAnswer: result.firstBuckets[item.itemKey] ?? null,
          ...(item.explanation === undefined ? {} : { explanation: item.explanation }),
          ...(item.correctBucketId === undefined ? {} : { correctBucketId: item.correctBucketId }),
          ...(item.why === undefined ? {} : { why: item.why }),
        })),
      },
      requiresReview: false,
    });
  }
}

interface Submission {
  placements: Placement[];
  attempt: number;
  reveal: boolean;
  locked: string[];
  firstAnswers: Record<string, string | null>;
}

/**
 * The shape of a submission, checked here because AJV cannot: the template's answer schema
 * describes the author's key, and the submission is a list of placements — so the type is
 * in `OWN_SUBMISSION_SHAPE`.
 *
 * `attempt`, `locked` and `firstAnswers` are read leniently and are not the client's to
 * decide: the submit handler overwrites them with what the attempt records. They are read
 * at all so a direct call in a test can drive a second check without a database. `reveal`
 * is the client's — «Vis riktig plassering» — and it costs the attempt, never earns.
 */
function readSubmission(submitted: unknown): Submission | null {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) return null;
  const raw = submitted as {
    placements?: unknown;
    attempt?: unknown;
    reveal?: unknown;
    locked?: unknown;
    firstAnswers?: unknown;
  };

  if (!Array.isArray(raw.placements)) return null;
  const placements: Placement[] = [];
  for (const entry of raw.placements) {
    if (typeof entry !== 'object' || entry === null) return null;
    const { itemId, bucketId } = entry as { itemId?: unknown; bucketId?: unknown };
    if (typeof itemId !== 'string' || typeof bucketId !== 'string') return null;
    placements.push({ itemId, bucketId });
  }

  const firstAnswers: Record<string, string | null> = {};
  if (typeof raw.firstAnswers === 'object' && raw.firstAnswers !== null) {
    for (const [itemId, bucketId] of Object.entries(raw.firstAnswers as Record<string, unknown>)) {
      firstAnswers[itemId] = typeof bucketId === 'string' && bucketId !== '' ? bucketId : null;
    }
  }

  return {
    placements,
    attempt: typeof raw.attempt === 'number' && raw.attempt >= 1 ? Math.trunc(raw.attempt) : 1,
    reveal: raw.reveal === true,
    locked: Array.isArray(raw.locked)
      ? raw.locked.filter((id): id is string => typeof id === 'string')
      : [],
    firstAnswers,
  };
}
