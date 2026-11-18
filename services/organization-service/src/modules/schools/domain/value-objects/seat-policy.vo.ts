/**
 * Student seats of a school (plan 90, phase 4, decided 10.11).
 *
 * A seat is a STUDENT row of the roster with `status active`; pending invitations and
 * archived learners take none. Up to `limit` is fine; past it the school runs on a grace of
 * `ceil(limit × 10 %)` (5 → 6, 30 → 33, 100 → 110) with a warning; at the ceiling a new
 * learner is refused. Learners already on the roster beyond the ceiling stay — a lower limit
 * never removes anyone.
 */

/** Share of the limit a school may run over before new learners are refused. */
export const SEAT_GRACE_RATIO = 0.1;

/**
 * `ok` — within the limit (or no limit); `warning` — over the limit, under the ceiling;
 * `full` — at or over the ceiling, the next learner is refused.
 */
export type SeatState = 'ok' | 'warning' | 'full';

/** What the school sees: `limit` / `ceiling` null = no limit. */
export interface SeatUsage {
  used: number;
  limit: number | null;
  ceiling: number | null;
  state: SeatState;
}

/** `refused` carries the usage as it stands (nothing was added). */
export type SeatDecision =
  | { admitted: true; seats: SeatUsage }
  | { admitted: false; seats: SeatUsage };

export function seatCeiling(limit: number): number {
  return limit + Math.ceil(limit * SEAT_GRACE_RATIO);
}

/** The usage of a roster holding `used` learners under `limit` (null = no limit). */
export function seatUsage(used: number, limit: number | null): SeatUsage {
  if (limit === null) return { used, limit: null, ceiling: null, state: 'ok' };
  const ceiling = seatCeiling(limit);
  const state: SeatState = used >= ceiling ? 'full' : used > limit ? 'warning' : 'ok';
  return { used, limit, ceiling, state };
}

/**
 * Whether one more learner fits a roster of `used` learners. Admitted → the usage after the
 * learner joins (its `state` is the warning for the school); refused → the usage as it is.
 */
export function admitOneStudent(used: number, limit: number | null): SeatDecision {
  const current = seatUsage(used, limit);
  if (current.ceiling !== null && used >= current.ceiling) return { admitted: false, seats: current };
  return { admitted: true, seats: seatUsage(used + 1, limit) };
}
