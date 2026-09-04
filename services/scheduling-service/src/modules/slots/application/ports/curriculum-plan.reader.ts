export const CURRICULUM_PLAN_READER = Symbol('ICurriculumPlanReader');

/**
 * One unit of a group's teaching plan, as much of it as scheduling needs to
 * decide which unit a generated lesson belongs to.
 */
export interface PlannedUnit {
  id: string;
  order: number;
  plannedSessions: number;
  /** Lessons already marked held against this unit — sessions that no longer need a slot. */
  deliveredSessions: number;
}

/**
 * Read side of the curriculum plan, seen from the slots module. The plan itself
 * belongs to the curriculum module; generation only needs to know the order of
 * its units and how much of each is already taught.
 */
export interface ICurriculumPlanReader {
  unitsForGroup(groupId: string): Promise<PlannedUnit[]>;
}
