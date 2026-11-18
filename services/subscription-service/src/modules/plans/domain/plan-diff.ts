import type { PlanFeature } from './plan.js';

/** What a key gives in one version; absent from the version = not given at all. */
export interface FeatureTerms {
  enabled: boolean;
  monthlyCredits: string | null;
  limits: Record<string, number>;
}

/**
 * One key whose terms differ between two versions:
 * - `added` — the key is in the target version only;
 * - `removed` — in the source version only (subscribers lose it unless a grant gives it);
 * - `changed` — in both, with a different switch, allowance or limit (`seats.students` `max` included).
 */
export interface FeatureChange {
  featureKey: string;
  change: 'added' | 'removed' | 'changed';
  before: FeatureTerms | null;
  after: FeatureTerms | null;
}

/**
 * Key-by-key difference between a source and a target version, ordered by key. Keys with the
 * same terms on both sides are left out; credits compare as numbers ("300" = "300.0").
 */
export function diffPlanFeatures(from: readonly PlanFeature[], to: readonly PlanFeature[]): FeatureChange[] {
  const before = new Map(from.map((f) => [f.featureKey, terms(f)]));
  const after = new Map(to.map((f) => [f.featureKey, terms(f)]));
  const keys = [...new Set([...before.keys(), ...after.keys()])].sort();

  const changes: FeatureChange[] = [];
  for (const featureKey of keys) {
    const b = before.get(featureKey) ?? null;
    const a = after.get(featureKey) ?? null;
    if (b && a) {
      if (!sameTerms(b, a)) changes.push({ featureKey, change: 'changed', before: b, after: a });
    } else if (a) {
      changes.push({ featureKey, change: 'added', before: null, after: a });
    } else {
      changes.push({ featureKey, change: 'removed', before: b, after: null });
    }
  }
  return changes;
}

function terms(f: PlanFeature): FeatureTerms {
  return { enabled: f.enabled, monthlyCredits: f.monthlyCredits, limits: { ...f.limits } };
}

function sameTerms(a: FeatureTerms, b: FeatureTerms): boolean {
  if (a.enabled !== b.enabled) return false;
  if (!sameCredits(a.monthlyCredits, b.monthlyCredits)) return false;
  const names = new Set([...Object.keys(a.limits), ...Object.keys(b.limits)]);
  for (const name of names) {
    if (a.limits[name] !== b.limits[name]) return false;
  }
  return true;
}

function sameCredits(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Number(a) === Number(b);
}
