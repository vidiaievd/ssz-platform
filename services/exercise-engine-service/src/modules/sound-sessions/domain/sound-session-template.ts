import type { SessionPlan } from './session-plan.js';
import type { SessionState } from './session-step.js';

/**
 * `sound_session` — the pronunciation session (plan 86, step 13.4). A template of the engine's own:
 * content-service's catalogue does not know it, because nobody authors one. A session is a probe
 * (Q27 A) built for one learner from their weak sounds; its content is the plan, its submission
 * the state the engine recorded.
 */
export const TEMPLATE_CODE = 'sound_session';

/** The probe's content: the plan, as `planSession` made it. */
export interface SoundSessionContent {
  version: 1;
  plan: SessionPlan;
}

export function toContent(plan: SessionPlan): SoundSessionContent {
  return { version: 1, plan };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * The plan out of a stored probe's content; null when it is not one. Checked for its frame only:
 * the content is written by this engine alone, and a plan that passed this check and still breaks
 * would be a bug of the writer, not a learner's input.
 */
export function readPlan(content: unknown): SessionPlan | null {
  if (!isObject(content) || content.version !== 1 || !isObject(content.plan)) return null;
  const plan = content.plan;
  if (
    typeof plan.language !== 'string' ||
    !['chosen', 'record', 'diagnostic'].includes(plan.basis as string) ||
    !Array.isArray(plan.sounds) ||
    !Array.isArray(plan.diagnostic) ||
    !Array.isArray(plan.candidates)
  ) {
    return null;
  }
  return plan as unknown as SessionPlan;
}

/** The state stored on the attempt; null when there is none or it is not one. */
export function readState(value: unknown): SessionState | null {
  if (!isObject(value)) return null;
  if (
    !['diagnostic', 'drill', 'done'].includes(value.phase as string) ||
    !Array.isArray(value.diagnostic) ||
    !Array.isArray(value.sounds) ||
    typeof value.takes !== 'number'
  ) {
    return null;
  }
  return value as unknown as SessionState;
}
