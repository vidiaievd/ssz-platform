import { Injectable } from '@nestjs/common';
import { Result } from '../../../shared/kernel/result.js';
import { ValidationError } from '../../../shared/application/ports/answer-validator.port.js';
import type { ValidationOutcome } from '../../../shared/application/ports/answer-validator.port.js';
import type { IPerTypeValidator, PerTypeValidateInput } from './per-type-validator.interface.js';
import { readPlan, readState } from '../../../modules/sound-sessions/domain/sound-session-template.js';
import {
  diagnosticWeak,
  soundOutcomes,
  type DoneReason,
  type SoundOutcome,
} from '../../../modules/sound-sessions/domain/session-step.js';
import type { PlanBasis } from '../../../modules/sound-sessions/domain/session-plan.js';

/** What a pronunciation session leaves on its attempt (plan 86, step 13.4c). */
export interface SoundSessionDetails {
  basis: PlanBasis;
  doneReason: DoneReason | null;
  takes: number;
  sounds: SoundOutcome[];
  /** Families the diagnostic heard as weak — flagged, never rated (§5.5). */
  diagnosticWeak: string[];
}

/**
 * `sound_session` — the session summed up from the state the engine recorded (plan 86, step 13.4).
 *
 * Like `minimal_pairs` the submission is the server's own: the submit handler writes the stored
 * state over whatever the body said, so this reads `{ state }` and nothing a learner could type.
 * The score is the share of the session's sounds that passed; a session with no sound to drill
 * (a diagnostic that found nothing weak) scores 100. What the session says about each sound's
 * card is `sounds[].rating`, which step 13.5 turns into evidence — the score is a summary only.
 */
@Injectable()
export class SoundSessionValidator implements IPerTypeValidator {
  validate(input: PerTypeValidateInput): Result<ValidationOutcome, ValidationError> {
    const plan = readPlan(input.content);
    if (!plan) {
      return Result.fail(new ValidationError('SS_NO_PLAN', 'This probe holds no session plan'));
    }
    const submission =
      typeof input.submittedAnswer === 'object' && input.submittedAnswer !== null
        ? (input.submittedAnswer as Record<string, unknown>)
        : {};
    const state = readState(submission['state']);
    if (!state) {
      return Result.fail(new ValidationError('SS_NO_STATE', 'This session has not begun and has nothing to score'));
    }

    const sounds = soundOutcomes(state);
    const passed = sounds.filter((s) => s.status === 'passed').length;
    const score = sounds.length === 0 ? 100 : Math.round((100 * passed) / sounds.length);
    const details: SoundSessionDetails = {
      basis: plan.basis,
      doneReason: state.doneReason,
      takes: state.takes,
      sounds,
      diagnosticWeak: diagnosticWeak(state),
    };
    return Result.ok({
      correct: sounds.length > 0 && passed === sounds.length,
      score,
      details,
      requiresReview: false,
    });
  }
}
