/**
 * Why a call was refused before any model was called — on purpose, not by an outage.
 *
 * - `ai_disabled` — the payer switched AI off (`refused_policy`);
 * - `region_not_allowed` — no model of the binding sits in a region the payer allows (`refused_policy`);
 * - `not_entitled` — the payer's tariff does not include this agent (`refused_quota`);
 * - `quota_exhausted` — the period's credits for this agent are spent (`refused_quota`).
 */
export type RefusalCode = 'ai_disabled' | 'region_not_allowed' | 'not_entitled' | 'quota_exhausted';

export type RefusalOutcome = 'refused_policy' | 'refused_quota';

export const REFUSAL_OUTCOME: Record<RefusalCode, RefusalOutcome> = {
  ai_disabled: 'refused_policy',
  region_not_allowed: 'refused_policy',
  not_entitled: 'refused_quota',
  quota_exhausted: 'refused_quota',
};
