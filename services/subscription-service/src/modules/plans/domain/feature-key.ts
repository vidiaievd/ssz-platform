import type { PlanAudience } from './plan.js';

/**
 * What a feature key measures, which decides the shape of its limits:
 *  - `ai_credits` — an AI agent; `monthlyCredits` is its allowance in platform credits
 *    (plan 48 §3), null = unmetered. `limits` may carry per-learner caps (Q1 of plan 78).
 *  - `switch` — on or off; no credits. `limits` holds plain counts.
 *  - `seats` — a head count (plan 90, phase 4); no credits, `limits.max` is required on the
 *    key while it is on and must be a whole number. It cannot be switched off by a grant:
 *    "no seats" is not a state a school can be put in that way.
 */
export type FeatureLimitKind = 'ai_credits' | 'switch' | 'seats';

export interface FeatureKeyDefinition {
  key: string;
  limitKind: FeatureLimitKind;
  /** Names of `limits` entries the key understands; anything else in a plan is refused. */
  limitNames: readonly string[];
  /** Limits a plan or grant must give whenever it has the key on. */
  requiredLimits?: readonly string[];
  /** The only audience the key makes sense for; absent = both. */
  audience?: PlanAudience;
}

/**
 * Learners on a workspace's roster (plan 90, phase 4). organization-service counts active
 * STUDENT rows against `limits.max`; a plan without the key has no seat limit.
 */
export const SEATS_STUDENTS_KEY = 'seats.students';

/**
 * The keys a plan may mention. Entitlements are data (plan 26 §B6), but the set of keys is
 * code: each one is checked by some service, and a key nothing checks would sell nothing.
 * Adding `scheduling` or `payments` later is one entry here.
 */
export const FEATURE_KEYS: readonly FeatureKeyDefinition[] = [
  { key: 'ai.review_draft', limitKind: 'ai_credits', limitNames: [] },
  { key: 'ai.review_direct', limitKind: 'ai_credits', limitNames: [] },
  { key: 'ai.student_assist', limitKind: 'ai_credits', limitNames: ['perLearnerMonthlyCredits'] },
  { key: 'ai.practice', limitKind: 'ai_credits', limitNames: ['perLearnerMonthlyCredits'] },
  { key: 'ai.authoring', limitKind: 'ai_credits', limitNames: [] },
  // Checking a `read_aloud` recording against its passage without a teacher (plan 82): the
  // recognizer's words decide the verdict. exercise-engine asks at hand-in, ai-service's gate
  // before the call.
  { key: 'ai.voice_review', limitKind: 'ai_credits', limitNames: [] },
  // The premium tier on top of it: pronunciation scores (Azure) beside the same verdict —
  // feedback only (plan 82 §2.3). Read by exercise-engine to pick the recognizer.
  { key: 'ai.voice_review_pronunciation', limitKind: 'ai_credits', limitNames: [] },
  // The AI-first review modes of a school (plan 80, R7): organization-service refuses to
  // save them without the key, exercise-engine does not apply them without it.
  { key: 'school.review_ai_policy', limitKind: 'switch', limitNames: [] },
  {
    key: SEATS_STUDENTS_KEY,
    limitKind: 'seats',
    limitNames: ['max'],
    requiredLimits: ['max'],
    audience: 'workspace',
  },
];

const BY_KEY = new Map(FEATURE_KEYS.map((d) => [d.key, d]));

export function featureKeyDefinition(key: string): FeatureKeyDefinition | undefined {
  return BY_KEY.get(key);
}
