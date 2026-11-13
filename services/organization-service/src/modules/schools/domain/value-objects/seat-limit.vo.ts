/**
 * The subscription feature key that limits learners on a school's roster (plan 90, phase 4).
 * Mirrors subscription-service's catalogue (`plans/domain/feature-key.ts`).
 */
export const SEATS_STUDENTS_FEATURE_KEY = 'seats.students';

/** One key of an entitlements snapshot, as far as seats need it. */
export interface SnapshotFeature {
  enabled?: unknown;
  limits?: unknown;
}

/**
 * The student seat limit an entitlements snapshot carries: `limits.max` of `seats.students`
 * while the key is on; null = no limit (the plan does not mention the key, or has it off).
 * Same rule as subscription-service's `studentSeatLimit()`; grants are already folded in.
 */
export function studentSeatLimitOf(features: Readonly<Record<string, SnapshotFeature | undefined>> | undefined): number | null {
  const f = features?.[SEATS_STUDENTS_FEATURE_KEY];
  if (!f || f.enabled !== true) return null;
  const max = (f.limits as Record<string, unknown> | undefined)?.['max'];
  return typeof max === 'number' && Number.isInteger(max) && max >= 0 ? max : null;
}
