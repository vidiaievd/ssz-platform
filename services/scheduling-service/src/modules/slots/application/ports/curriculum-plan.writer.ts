import type { CourseOutline } from './course-outline.reader.js';

export const CURRICULUM_PLAN_WRITER = Symbol('ICurriculumPlanWriter');

/**
 * Write side of the curriculum plan, seen from the slots module.
 *
 * Only one thing is written from here, and only when there is nothing to overwrite: the
 * plan a private tutor never gets to draw. The planner screen is a school's, and a group
 * without a plan has no unit to name, which leaves `delivered` at zero for good — the
 * progress screens then report a tutor who teaches every week as having taught nothing.
 */
export interface ICurriculumPlanWriter {
  /**
   * Derive the group's teaching plan from its course, unit for unit.
   *
   * Does nothing when a plan already exists: a plan that has been taught against owns the
   * lessons that name its units, and redrawing it would take the group's progress with it.
   * Answers whether it wrote one.
   */
  ensureFromCourse(input: {
    groupId: string;
    schoolId: string;
    outline: CourseOutline;
  }): Promise<boolean>;
}
