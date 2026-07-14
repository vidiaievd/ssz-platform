import type { SchoolGroup } from '../entities/school-group.entity.js';

export interface ISchoolGroupRepository {
  findById(id: string): Promise<SchoolGroup | null>;
  findBySchoolId(schoolId: string): Promise<SchoolGroup[]>;
  /** Returns active groups where the given user is assigned as primary teacher. */
  findActiveGroupsWithPrimaryTeacher(schoolId: string, userId: string): Promise<SchoolGroup[]>;
  /**
   * Returns non-deleted groups teaching the given course — either as their
   * main material (courseId) or an additional material (GroupMaterial).
   * Used to derive "assigned teacher" for a content-service course/module
   * (plan 29 BE4.2): a module's assigned teacher is the teacher of whichever
   * group is currently teaching its course, not a per-module assignment.
   */
  findByCourseId(schoolId: string, courseId: string): Promise<SchoolGroup[]>;
  save(group: SchoolGroup): Promise<void>;
  saveWithMember(
    group: SchoolGroup,
    userId: string,
    memberId: string,
    role?: 'student' | 'trial' | 'observer',
  ): Promise<void>;
  removeMember(groupId: string, userId: string): Promise<void>;
}

export const SCHOOL_GROUP_REPOSITORY = Symbol('ISchoolGroupRepository');
