import { Injectable } from '@nestjs/common';
import { fromPersisted, probeRecords, readDraw, summarize } from '@ssz/shared-kernel/minimal-pairs';
import type { PairResult, ProbeRecord, ProbeState } from '@ssz/shared-kernel/minimal-pairs';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';

/**
 * What a `minimal_pairs` sitting leaves on the attempt (plan 72 §3.7).
 *
 * The tally and the per-pair lines are the student's result. `probes` is the teacher's and the
 * report's: per probe what was played, the first and the last answer, how many tries and the
 * clip's provenance — DECISIONS §2, «it travels into the report so a bad batch can be traced
 * later». It is also what `weakest` reads the student's history from on their next sitting.
 */
export interface MinimalPairsDetails {
  right: number;
  total: number;
  score: number;
  passed: boolean;
  passPct: number;
  pairs: PairResult[];
  probes: ProbeRecord[];
}

/**
 * The submission is the server's own, never the client's: the submit handler writes the draw
 * stored at the start and the picks recorded by `/answers` over whatever the body said, so
 * this reads `{ draw, states }` and nothing a student could have typed.
 */
function readStates(value: unknown): ProbeState[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): ProbeState[] => {
    if (typeof raw !== 'object' || raw === null) return [];
    const r = raw as Record<string, unknown>;
    if (typeof r['n'] !== 'number' || !Array.isArray(r['picks'])) return [];
    return [
      {
        n: r['n'],
        picks: r['picks'].filter((p): p is string => typeof p === 'string'),
        closed: r['closed'] === true,
      },
    ];
  });
}

/**
 * `minimal_pairs` — the sitting summed up against the document as it stands now.
 *
 * Every probe counts by its first answer, and a probe never answered counts as wrong (the
 * kernel's `summarize`). The pass mark is the author's, so the validator says whether this is a
 * pass rather than leaving the platform's 70 to disagree with «kravet er T%». Nothing here goes
 * to a person: the verdict is an id comparison.
 */
@Injectable()
export class MinimalPairsValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const submission =
      typeof input.submittedAnswer === 'object' && input.submittedAnswer !== null
        ? (input.submittedAnswer as Record<string, unknown>)
        : {};
    const draw = readDraw(submission['draw']);
    if (draw.length === 0) {
      return Result.fail(
        new ValidationError('MP_NO_DRAW', 'This attempt drew no probes and has nothing to score'),
      );
    }
    const states = readStates(submission['states']);

    const document = fromPersisted(input.content, input.expectedAnswers);
    const summary = summarize(document, draw, states);
    const details: MinimalPairsDetails = {
      ...summary,
      probes: probeRecords(document, draw, states),
    };

    return Result.ok({
      correct: summary.total > 0 && summary.right === summary.total,
      score: summary.score,
      passed: summary.passed,
      details,
      requiresReview: false,
    });
  }
}
