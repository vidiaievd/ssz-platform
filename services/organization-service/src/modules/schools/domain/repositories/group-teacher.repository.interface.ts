import type { GroupTeacherProps, GroupTeacherRole } from '../entities/school-group.entity.js';

export interface IGroupTeacherRepository {
  findByGroupId(groupId: string): Promise<GroupTeacherProps[]>;
  findByGroupAndUser(groupId: string, userId: string, role: GroupTeacherRole): Promise<GroupTeacherProps | null>;
  save(teacher: GroupTeacherProps): Promise<void>;
  remove(groupId: string, userId: string, role: GroupTeacherRole): Promise<void>;
  removeAllForGroup(groupId: string): Promise<void>;
}

export const GROUP_TEACHER_REPOSITORY = Symbol('IGroupTeacherRepository');
