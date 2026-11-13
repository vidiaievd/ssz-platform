import type { PlanVersion } from '../domain/plan.js';

/** A plan version as the trail keeps it: its number and full feature list. */
export function planVersionSnapshot(v: PlanVersion): Record<string, unknown> {
  return {
    version: v.version,
    features: v.features.map((f) => ({
      featureKey: f.featureKey,
      enabled: f.enabled,
      monthlyCredits: f.monthlyCredits,
      limits: f.limits,
    })),
  };
}
