import type { WeekDay } from '../../domain/entities/slot.entity.js';
import type { LessonType } from '../../domain/entities/lesson.entity.js';

const WEEKDAY_JS: Record<WeekDay, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Guard against a plan whose items outlive any sane course. */
const MAX_WEEKS = 520;

/** A course unit, as much of it as planning a group's sessions needs. */
export interface OutlineUnit {
  id: string;
  order: number;
  items: Array<{ id: string; itemType: string }>;
}

/** One session the plan calls for, before it is given a date. */
export interface PlanItem {
  planIndex: number;
  type: LessonType;
  contentUnitId: string;
  /** The course item this session teaches; null for a checkpoint, and for a unit with no lessons. */
  contentLessonId: string | null;
}

export interface PlanSlot {
  id: string;
  weekday: WeekDay;
  startTime: string;
  endTime: string;
  room: string | null;
}

/** A plan item that now has a date, a time and a room. */
export interface PlannedSession extends PlanItem {
  slot: PlanSlot;
  date: Date;
}

/**
 * The sessions a course calls for, in teaching order: one per lesson of each
 * unit, then a checkpoint exam closing the unit.
 *
 * Only items that are lessons earn a session of their own. A unit also holds
 * word lists, grammar rules and exercises, and giving each of those its own
 * session would turn a 14-session course into a 60-session one whose log read
 * "vocabulary list" more often than it read a topic. They stay pickable as a
 * session's topic — a teacher who spent a class on one says so — they just do
 * not create sessions.
 *
 * A unit with no lessons at all (a course's grammar-and-exercises unit is
 * usually one) still gets a session: it is taught, so it needs somewhere to be
 * taught. Its topic is the unit itself.
 */
export function buildPlanItems(units: OutlineUnit[]): PlanItem[] {
  const items: PlanItem[] = [];
  const push = (item: Omit<PlanItem, 'planIndex'>) =>
    items.push({ ...item, planIndex: items.length });

  for (const unit of [...units].sort((a, b) => a.order - b.order)) {
    const lessons = unit.items.filter((i) => i.itemType === 'lesson');

    if (lessons.length) {
      for (const lesson of lessons) {
        push({ type: 'lesson', contentUnitId: unit.id, contentLessonId: lesson.id });
      }
    } else {
      push({ type: 'lesson', contentUnitId: unit.id, contentLessonId: null });
    }

    // A checkpoint per unit, so a manager sees where the group started to slip
    // rather than only that it did.
    push({ type: 'exam', contentUnitId: unit.id, contentLessonId: null });
  }

  return items;
}

/** Occupied slot key — one session per slot occurrence, never two. */
export function occurrenceKey(date: Date, startTime: string): string {
  return `${date.toISOString().slice(0, 10)}|${startTime}`;
}

/**
 * Slot occurrences from `from` onwards, in calendar order, at most `count` of
 * them. Anything already occupied — a lesson held, cancelled or added by hand —
 * is stepped over rather than double-booked.
 *
 * Weeks are walked rather than computed from the item's index, because the first
 * week is rarely whole: a course starting on a Wednesday with Tuesday and
 * Thursday slots begins on the Thursday, and every later week then follows the
 * pattern.
 */
export function slotOccurrences(
  slots: PlanSlot[],
  from: Date,
  count: number,
  taken: ReadonlySet<string> = new Set(),
): Array<{ slot: PlanSlot; date: Date }> {
  if (!slots.length || count <= 0) return [];

  const ordered = [...slots].sort(
    (a, b) =>
      WEEKDAY_JS[a.weekday] - WEEKDAY_JS[b.weekday] || a.startTime.localeCompare(b.startTime),
  );

  const start = utcMidnight(from);
  // Sunday of the week `from` falls in, so weekday offsets are plain arithmetic.
  const weekStart = addDays(start, -start.getUTCDay());

  const out: Array<{ slot: PlanSlot; date: Date }> = [];
  for (let week = 0; week < MAX_WEEKS && out.length < count; week++) {
    for (const slot of ordered) {
      if (out.length >= count) break;
      const date = addDays(weekStart, week * 7 + WEEKDAY_JS[slot.weekday]);
      if (date < start) continue;
      if (taken.has(occurrenceKey(date, slot.startTime))) continue;
      out.push({ slot, date });
    }
  }
  return out;
}

/**
 * Gives each plan item a date. Items outlive the group's end date when the
 * course is longer than the term — deliberately: a course that does not fit in
 * the time booked for it is a fact the schedule should show, not one to hide by
 * dropping its tail.
 */
export function layoutPlan(
  items: PlanItem[],
  slots: PlanSlot[],
  from: Date,
  taken: ReadonlySet<string> = new Set(),
): PlannedSession[] {
  const occurrences = slotOccurrences(slots, from, items.length, taken);
  return items
    .slice(0, occurrences.length)
    .map((item, i) => ({ ...item, slot: occurrences[i]!.slot, date: occurrences[i]!.date }));
}

/**
 * Midnight UTC, deliberately — not local midnight. A session's date is a calendar
 * day, stored in a date column, and building it in local time makes the whole
 * plan depend on the timezone of whichever process generated it: west of UTC it
 * lands a day late, east of it a day early.
 */
export function utcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
