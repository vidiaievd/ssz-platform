import type { GroupMaterialProps } from '../entities/school-group.entity.js';

export interface IGroupMaterialRepository {
  findByGroupId(groupId: string): Promise<GroupMaterialProps[]>;
  findByGroupAndCourse(groupId: string, courseId: string): Promise<GroupMaterialProps | null>;
  add(material: GroupMaterialProps): Promise<void>;
  remove(groupId: string, materialId: string): Promise<void>;
  removeAllForGroup(groupId: string): Promise<void>;
}

export const GROUP_MATERIAL_REPOSITORY = Symbol('IGroupMaterialRepository');
