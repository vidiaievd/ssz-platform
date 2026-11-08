import type { TakeVerdict } from '../domain/session-step.js';
import type { SoundTakeOutcome, TonemeTakeOutcome } from './ports/sound-session.ports.js';

/**
 * What ai-service answered about a take, reduced to what the session moves on (plan 86, step
 * 13.4b), or why the session cannot go on at all.
 *
 * - `verdict` — the take counts: measured (passed or missed) or not measured (§5.2: a take that
 *   was heard badly is not a miss);
 * - `stop` — the payer may not go on (`pool_empty`, `not_available`), or ai-service has heard all
 *   the takes it hears for one session (`session_limit` → `take_limit`, step 14.1): the session
 *   closes with what it measured (§5.5a);
 * - `retry` — nothing was spent and nothing judged (a provider away, a recording not ready, the
 *   daily limit of a sentence): the same step again, the take not counted.
 *
 * Pure; the HTTP answers come in as they are.
 */
export type TakeReading =
  | { kind: 'verdict'; verdict: TakeVerdict }
  | { kind: 'stop'; reason: 'pool_empty' | 'not_available' | 'take_limit' }
  | { kind: 'retry'; reason: string };

const NOT_MEASURED: TakeReading = { kind: 'verdict', verdict: { measured: false } };

/** A take of a word in its frame or of a course line, judged on the target's sound (step 13.3). */
export function readSoundTake(outcome: SoundTakeOutcome): TakeReading {
  if (outcome.status === 'refused') {
    if (outcome.reason === 'pool_empty' || outcome.reason === 'not_available') {
      return { kind: 'stop', reason: outcome.reason };
    }
    if (outcome.reason === 'session_limit') return { kind: 'stop', reason: 'take_limit' };
    // `target_not_*` and `language_not_supported` are the plan's own fault — the material was
    // checked against the same rules; the take is not the learner's miss.
    return { kind: 'retry', reason: outcome.reason };
  }
  if (outcome.status === 'failed') return failed(outcome.errorCode);

  const target = outcome.target;
  if (!target || !target.measured) return NOT_MEASURED;
  return {
    kind: 'verdict',
    verdict: {
      measured: true,
      passed: target.passed,
      key: target.passed ? null : target.weakest.key,
      explained: target.explained,
    },
  };
}

/**
 * A toneme take (plan 88 Q4): `like_reference` passes; `other_tone` is a miss, keyed by the
 * toneme heard (`TONE:1`); `unsure` and `not_measured` measure nothing — the take leans the other
 * way without being far from the reference, and «wrong» is said only when it is (Q4). A word not
 * heard where the frame puts it is not measured either. The model explains nothing here.
 */
export function readTonemeTake(outcome: TonemeTakeOutcome): TakeReading {
  if (outcome.status === 'refused') {
    if (outcome.reason === 'pool_empty' || outcome.reason === 'not_available') {
      return { kind: 'stop', reason: outcome.reason };
    }
    if (outcome.reason === 'session_limit') return { kind: 'stop', reason: 'take_limit' };
    return { kind: 'retry', reason: outcome.reason };
  }
  if (outcome.status === 'failed') return failed(outcome.errorCode);
  if (outcome.status === 'unheard') return NOT_MEASURED;

  const verdict = outcome.comparison.verdict;
  if (verdict.kind === 'like_reference') {
    return { kind: 'verdict', verdict: { measured: true, passed: true, key: null, explained: false } };
  }
  if (verdict.kind === 'other_tone') {
    return {
      kind: 'verdict',
      verdict: { measured: true, passed: false, key: `TONE:${verdict.heardAs}`, explained: false },
    };
  }
  return NOT_MEASURED;
}

/**
 * A failure the learner caused — a silent or unreadable recording — is a take that measured
 * nothing; anything else (the provider away, a recording still uploading) costs no take.
 */
function failed(errorCode: string): TakeReading {
  if (errorCode === 'recording_inaudible' || errorCode === 'recording_unreadable') return NOT_MEASURED;
  return { kind: 'retry', reason: errorCode };
}
