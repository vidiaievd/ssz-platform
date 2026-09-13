import type { CourseOutline } from '../ports/course-outline.reader.js';

/** One unit of a teaching plan derived from a course, before it is written anywhere. */
export interface DerivedPlanUnit {
  title: string;
  order: number;
  plannedSessions: number;
  contentUnitId: string;
}

/**
 * A teaching plan as the course would draw it: one plan unit per course unit, in the
 * course's own order, stitched by `contentUnitId` so a generated session can name the unit
 * it teaches.
 *
 * This is what a private tutor's plan is derived from — they have no planner screen, and a
 * group with no plan has no unit for a session to name, which leaves `delivered` at zero
 * however many lessons are held (plan 62, phase 1).
 */
export function planUnitsFromOutline(outline: CourseOutline): DerivedPlanUnit[] {
  return outline.units.map((unit, index) => ({
    title: unit.title ?? `Unit ${index + 1}`,
    order: unit.order,
    // One session per lesson of the unit, and never fewer than one: a unit is taught even
    // when the course holds nothing but a word list for it.
    plannedSessions: Math.max(1, unit.items.filter((item) => item.itemType === 'lesson').length),
    contentUnitId: unit.id,
  }));
}
