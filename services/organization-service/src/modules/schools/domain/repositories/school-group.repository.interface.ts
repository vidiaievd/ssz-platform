import type { SchoolGroup } from '../entities/school-group.entity.js';

export interface ISchoolGroupRepository {
  findById(id: string): Promise<SchoolGroup | null>;
  findBySchoolId(schoolId: string): Promise<SchoolGroup[]>;
  /** Returns active groups where the given user is assigned as primary teacher. */
  findActiveGroupsWithPrimaryTeacher(schoolId: string, userId: string): Promise<SchoolGroup[]>;
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
