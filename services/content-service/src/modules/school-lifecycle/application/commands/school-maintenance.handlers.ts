import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  onSchoolClosed,
  onSchoolRestored,
  type CourseMaintenance,
  type MaintenanceChange,
} from '../../domain/school-course-maintenance.js';
import {
  SCHOOL_MATERIALS_STORE,
  type ISchoolMaterialsStore,
  type SchoolCourse,
} from '../ports/school-materials.store.port.js';
import {
  ApplySchoolClosedCommand,
  ApplySchoolRestoredCommand,
} from './school-lifecycle.commands.js';

/** Applies one rule to every course and writes each distinct answer once. Returns how many changed. */
export async function applyMaintenanceRule(
  store: ISchoolMaterialsStore,
  courses: readonly SchoolCourse[],
  rule: (course: CourseMaintenance) => MaintenanceChange,
  at: Date,
): Promise<number> {
  const byChange = new Map<string, { change: NonNullable<MaintenanceChange>; ids: string[] }>();
  for (const course of courses) {
    const change = rule(course);
    if (!change) continue;
    const key = `${change.status}/${change.source}`;
    const group = byChange.get(key);
    if (group) group.ids.push(course.id);
    else byChange.set(key, { change, ids: [course.id] });
  }
  let changed = 0;
  for (const { change, ids } of byChange.values()) {
    await store.setMaintenance(ids, change, at);
    changed += ids.length;
  }
  return changed;
}

@CommandHandler(ApplySchoolClosedCommand)
export class ApplySchoolClosedHandler implements ICommandHandler<ApplySchoolClosedCommand, number> {
  private readonly logger = new Logger(ApplySchoolClosedHandler.name);

  constructor(@Inject(SCHOOL_MATERIALS_STORE) private readonly store: ISchoolMaterialsStore) {}

  async execute({ schoolId, schoolName }: ApplySchoolClosedCommand): Promise<number> {
    const courses = await this.store.findCourses(schoolId);
    const changed = await applyMaintenanceRule(this.store, courses, onSchoolClosed, new Date());
    await this.store.snapshotSchoolName(schoolId, schoolName, false);
    this.logger.log(
      `School ${schoolId} closed: ${changed} of ${courses.length} course(s) now unmaintained`,
    );
    return changed;
  }
}

@CommandHandler(ApplySchoolRestoredCommand)
export class ApplySchoolRestoredHandler implements ICommandHandler<
  ApplySchoolRestoredCommand,
  number
> {
  private readonly logger = new Logger(ApplySchoolRestoredHandler.name);

  constructor(@Inject(SCHOOL_MATERIALS_STORE) private readonly store: ISchoolMaterialsStore) {}

  async execute({ schoolId }: ApplySchoolRestoredCommand): Promise<number> {
    const courses = await this.store.findCourses(schoolId);
    const changed = await applyMaintenanceRule(this.store, courses, onSchoolRestored, new Date());
    this.logger.log(`School ${schoolId} restored: ${changed} course(s) maintained again`);
    return changed;
  }
}
