/**
 * A school's student seat limit as subscription-service last stated it (plan 90, phase 4).
 * `max` null = no limit. `version` and `validUntil` come from the entitlements snapshot and
 * decide which of two snapshots is newer and when a held one goes stale.
 */
export interface SeatLimitSnapshot {
  max: number | null;
  version: number;
  validUntil: Date;
}

/** The local projection of `subscription.entitlements.changed` for workspaces. */
export interface ISeatLimitProjection {
  get(schoolId: string): Promise<SeatLimitSnapshot | null>;
  /**
   * Keeps the snapshot unless the held one supersedes it (higher version, or the same version
   * with a later `validUntil`). True = stored.
   */
  save(schoolId: string, snapshot: SeatLimitSnapshot): Promise<boolean>;
}

/** subscription-service's internal entitlements API, read for the seat limit. Throws when it cannot answer. */
export interface ISeatLimitSource {
  fetchStudentSeatLimit(schoolId: string): Promise<SeatLimitSnapshot>;
}

/**
 * What the roster checks read. `known: false` = the limit could not be had (no projection and
 * the read through failed); the caller lets the learner in and the excess shows up in the
 * platform admin's attention queue (plan 90 §6.4, decided 10.11).
 */
export type SeatLimitReading = { known: true; max: number | null } | { known: false };

export interface ISeatLimitReader {
  studentSeatLimit(schoolId: string): Promise<SeatLimitReading>;
}

export const SEAT_LIMIT_PROJECTION = Symbol('ISeatLimitProjection');
export const SEAT_LIMIT_SOURCE = Symbol('ISeatLimitSource');
export const SEAT_LIMIT_READER = Symbol('ISeatLimitReader');
