import type { AdminSchoolStatus, SchoolKindValue } from './admin-school.js';

/**
 * Platform-wide numbers for the admin dashboard (plan 90 §5, phase 1, step 8).
 *
 * People are counted once however many schools they are in. A teacher is a TEACHER roster
 * row or the tutor of a SOLO workspace (its owner — never a roster row). Students and
 * teachers of soft-deleted schools count nowhere.
 */

export const ADMIN_STATS_DEFAULT_DAYS = 30;
export const ADMIN_STATS_MAX_DAYS = 366;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A run of whole UTC days: `[start, end)`, with `days` the inclusive day labels. */
export interface StatsPeriod {
  start: Date;
  end: Date;
  days: string[];
}

export type PeriodResult = { ok: true; period: StatsPeriod } | { ok: false; error: string };

/**
 * `from` and `to` are UTC calendar days, both inclusive (`2026-10-11` … `2026-11-09` = 30 days).
 * No `to` = today; no `from` = 30 days ending at `to`.
 */
export function resolvePeriod(from: string | undefined, to: string | undefined, now: Date): PeriodResult {
  const toDay = to === undefined ? startOfUtcDay(now) : parseDay(to);
  if (!toDay) return { ok: false, error: '`to` must be a date YYYY-MM-DD' };

  const fromDay =
    from === undefined ? new Date(toDay.getTime() - (ADMIN_STATS_DEFAULT_DAYS - 1) * DAY_MS) : parseDay(from);
  if (!fromDay) return { ok: false, error: '`from` must be a date YYYY-MM-DD' };
  if (fromDay > toDay) return { ok: false, error: '`from` must not be after `to`' };

  const count = Math.round((toDay.getTime() - fromDay.getTime()) / DAY_MS) + 1;
  if (count > ADMIN_STATS_MAX_DAYS) return { ok: false, error: `The period is at most ${ADMIN_STATS_MAX_DAYS} days` };

  const days = Array.from({ length: count }, (_, i) => dayLabel(new Date(fromDay.getTime() + i * DAY_MS)));
  return { ok: true, period: { start: fromDay, end: new Date(toDay.getTime() + DAY_MS), days } };
}

export interface DailyCount {
  day: string;
  count: number;
}

export interface AdminStatsDay {
  date: string;
  /** Workspaces created that day (deleted ones too — they were created). */
  schools: number;
  /** People who became a student of any school for the first time that day. */
  students: number;
  /** People who became a teacher (roster row or SOLO tutor) for the first time that day. */
  teachers: number;
}

/** Every day of the period in order, zeros where nothing happened. */
export function fillDays(
  days: string[],
  series: { schools: DailyCount[]; students: DailyCount[]; teachers: DailyCount[] },
): AdminStatsDay[] {
  const index = (rows: DailyCount[]) => new Map(rows.map((r) => [r.day, r.count]));
  const schools = index(series.schools);
  const students = index(series.students);
  const teachers = index(series.teachers);
  return days.map((date) => ({
    date,
    schools: schools.get(date) ?? 0,
    students: students.get(date) ?? 0,
    teachers: teachers.get(date) ?? 0,
  }));
}

/** The attention lists stop at this many schools each; `truncated` says there were more. */
export const ADMIN_SEATS_ATTENTION_LIMIT = 100;

export interface AdminSeatsAttentionItem {
  schoolId: string;
  name: string;
  slug: string;
  used: number;
  limit: number;
}

export interface AdminSeatsAttention {
  /** Schools in this state, all of them. */
  total: number;
  /** Up to `ADMIN_SEATS_ATTENTION_LIMIT`, the most crowded first. */
  items: AdminSeatsAttentionItem[];
  truncated: boolean;
}

export interface AdminSeatsStats {
  /** Active learners and seats summed over schools (not deleted) with a numeric limit. */
  used: number;
  limit: number;
  schoolsLimited: number;
  /** At 90 % of the limit or more, not over it. */
  near: AdminSeatsAttention;
  /** More active learners than the limit. */
  over: AdminSeatsAttention;
}

export interface AdminStats {
  from: string;
  to: string;
  schools: {
    total: number;
    byStatus: Record<AdminSchoolStatus, number>;
    byKind: Record<SchoolKindValue, number>;
    createdInPeriod: number;
  };
  /** `total` = people with an active student row now; `newInPeriod` = first student row in the period. */
  students: { total: number; newInPeriod: number };
  teachers: { total: number; newInPeriod: number };
  daily: AdminStatsDay[];
  seats: AdminSeatsStats;
}

/** Raw numbers from persistence; the handler shapes them. */
export interface AdminStatsSnapshot {
  schools: { kind: SchoolKindValue; status: AdminSchoolStatus; count: number }[];
  studentsTotal: number;
  teachersTotal: number;
  daily: { schools: DailyCount[]; students: DailyCount[]; teachers: DailyCount[] };
  seats: {
    used: number;
    limit: number;
    schoolsLimited: number;
    /** Every school at 90 % of its limit or more, most crowded first (the handler caps the lists). */
    attention: (AdminSeatsAttentionItem & { over: boolean })[];
  };
}

export interface IAdminStatsReader {
  snapshot(start: Date, end: Date): Promise<AdminStatsSnapshot>;
}

export const ADMIN_STATS_READER = Symbol('IAdminStatsReader');

function parseDay(value: string): Date | null {
  if (!ISO_DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || dayLabel(date) !== value ? null : date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayLabel(date: Date): string {
  return date.toISOString().slice(0, 10);
}
