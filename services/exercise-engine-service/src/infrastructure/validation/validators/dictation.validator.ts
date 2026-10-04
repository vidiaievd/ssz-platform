import { Injectable } from '@nestjs/common';
import { check, fromPersisted, readSegmentStates } from '@ssz/shared-kernel/dictation';
import type { SegmentState } from '@ssz/shared-kernel/dictation';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/**
 * The longest text one check may carry. Far beyond any sentence a dictation holds — even a
 * whole text in one segment — and short enough that the word alignment, quadratic in the two
 * lengths, stays cheap whatever a script sends.
 */
const MAX_TEXT = 4000;

/**
 * Grades `dictation`: one segment per submit, inside one attempt (plan 68 §3.4 — the
 * mechanics of `highlight_in_text`, plan 67 Q1-A, with a sentence where that type has a
 * question).
 *
 * Every decision is the kernel's `check` — the word diff and its classes under the author's
 * marking rules and the course's language pack, the per-segment budget, whether a reveal is
 * allowed, the throttle, which parts of the key a check may carry (the focus words that came
 * back wrong, the segment's reason only after a failed check under `hints`, the sentence only
 * on a reveal, a transcript slice only for a closed segment). This file gets the inputs
 * right, and three of them are facts about the attempt that the submit handler writes over
 * the submission before this runs:
 *
 *   * **every segment's state so far** (`segments`) — checks made, the first check (the
 *     evidence, DECISIONS §8), passed, revealed, closed, the last checked text, the time of
 *     the last check. Carried forward in the attempt's own details, never read from the
 *     client;
 *   * **whether the attempt is graded** (`graded`) — one check per segment, no hint, no
 *     reveal (plan 67, Q8-A);
 *   * **the time** (`now`) — the throttle (decision Q4-A) is the kernel's, and the clock is
 *     the server's.
 *
 * The outcome is about the attempt, not the segment: `score` is the mean of the first checks
 * over the ready segments and `passed` compares it with `settings.threshold`. The segment's
 * own verdict is in the details, where the runner reads it. `inProgress` says a segment is
 * still open, so the handler records the check and keeps the attempt open.
 *
 * Nothing routes to a teacher: the verdict is a word alignment (AC-X4).
 */
@Injectable()
export class DictationValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submission = readSubmission(input.submittedAnswer);
    if (submission === null) {
      return Result.fail(
        new ValidationError(
          'SCHEMA_MISMATCH',
          'Answer must be `{ segmentId, text, reveal? }` — one segment per submit, with text unless revealing',
        ),
      );
    }

    const outcome = check({
      ex: fromPersisted(input.content, input.expectedAnswers),
      segmentId: submission.segmentId,
      text: submission.text,
      reveal: submission.reveal,
      segments: submission.segments,
      graded: submission.graded,
      ...(submission.now === null ? {} : { now: submission.now }),
    });

    if (!outcome.ok) {
      return Result.fail(new ValidationError(outcome.code, REFUSALS[outcome.code]));
    }

    const r = outcome.result;
    return Result.ok<ValidationOutcome, ValidationError>({
      correct: r.passed,
      score: r.attemptPct,
      passed: r.attemptPassed,
      inProgress: !r.complete,
      // An allowlist of the kernel's result, field by field, so a field added there later
      // does not travel to the learner by being forgotten here.
      details: {
        segmentId: r.segmentId,
        /** This check of this segment. On a reveal: its first check. */
        pct: r.pct,
        passed: r.passed,
        words: r.words,
        /** The corrected line; empty on a reveal. */
        ops: r.ops,
        /** Near misses earned half credit on this check — the verdict says so. */
        nearCredit: r.nearCredit,
        /** The wrong focus words by name with their reasons (AC-M7). */
        focus: r.focus,
        ...(r.why === undefined ? {} : { why: r.why }),
        // The sentence with its reasons — only on a reveal.
        ...(r.key === undefined ? {} : { key: r.key }),
        // This sentence for the transcript drawer — only once it is closed (plan 68 §3.6).
        ...(r.transcriptSlice === undefined ? {} : { transcriptSlice: r.transcriptSlice }),
        attempt: r.attempt,
        /** Null for unlimited. */
        checksLeft: r.checksLeft,
        closed: r.closed,
        revealed: r.revealed,
        /** Every ready segment's state — the rail, and what the handler carries forward. */
        segments: r.segments,
        complete: r.complete,
        attemptPct: r.attemptPct,
        attemptPassed: r.attemptPassed,
      },
      requiresReview: false,
    });
  }
}

const REFUSALS: Record<string, string> = {
  DICT_SEGMENT_UNKNOWN: 'This exercise has no such segment to answer',
  DICT_SEGMENT_CLOSED: 'This segment is closed and cannot be submitted again',
  DICT_REVEAL_NOT_ALLOWED: 'The sentence cannot be shown for this segment now',
  DICT_TOO_FAST: 'Checks of one segment must be at least two seconds apart',
};

interface Submission {
  segmentId: string;
  text: string;
  reveal: boolean;
  segments: SegmentState[];
  graded: boolean;
  now: number | null;
}

/**
 * The shape of a submission, checked here because AJV cannot: the template's answer schema
 * describes the author's key, and the submission is one segment's typed text — so the type
 * is in `OWN_SUBMISSION_SHAPE`.
 *
 * `text` is required and must hold a word's worth of something unless this is a reveal:
 * «Sjekk» is disabled on an empty field (AC-R4), so a blank check is a client bug rather
 * than an answer — and taking it would spend a check on nothing.
 *
 * `segments`, `graded` and `now` are read leniently and are not the client's to decide: the
 * submit handler overwrites them with what the attempt records and with its own clock. They
 * are read at all so a direct call in a test can drive a second submit without a database.
 */
function readSubmission(submitted: unknown): Submission | null {
  if (typeof submitted !== 'object' || submitted === null || Array.isArray(submitted)) return null;
  const raw = submitted as {
    segmentId?: unknown;
    text?: unknown;
    reveal?: unknown;
    segments?: unknown;
    graded?: unknown;
    now?: unknown;
  };

  if (typeof raw.segmentId !== 'string' || raw.segmentId === '') return null;
  const reveal = raw.reveal === true;

  let text = '';
  if (raw.text !== undefined || !reveal) {
    if (typeof raw.text !== 'string' || raw.text.length > MAX_TEXT) return null;
    if (raw.text.trim() === '' && !reveal) return null;
    text = raw.text;
  }

  return {
    segmentId: raw.segmentId,
    text,
    reveal,
    segments: readSegmentStates(raw.segments),
    graded: raw.graded === true,
    now: typeof raw.now === 'number' && Number.isFinite(raw.now) ? raw.now : null,
  };
}
