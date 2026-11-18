import type { SeatDecision } from '../value-objects/seat-policy.vo.js';

/** The roster row a seat claim writes when admitted. */
export type SeatClaim =
  /** A new STUDENT row (direct add, accepted invitation). Same id the aggregate holds. */
  | {
      kind: 'insert';
      memberId: string;
      userId: string;
      joinedAt: Date;
      name: string | null;
      avatarUrl: string | null;
    }
  /** An archived STUDENT row back to `active`. */
  | { kind: 'reactivate'; userId: string };

/**
 * Seats of a school's roster (plan 90, phase 4). `claim` counts and writes under one lock per
 * school, so two learners racing for the last seat cannot both get it.
 */
export interface IStudentSeatRepository {
  /** Active STUDENT rows of the roster. */
  countActiveStudents(schoolId: string): Promise<number>;

  /**
   * Holding the school's seat lock: counts the active learners, asks `decide`, and writes the
   * claim only when it admits. Returns the decision as `decide` gave it.
   */
  claim(schoolId: string, claim: SeatClaim, decide: (used: number) => SeatDecision): Promise<SeatDecision>;
}

export const STUDENT_SEAT_REPOSITORY = Symbol('IStudentSeatRepository');
