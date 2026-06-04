import type { GroupMode, GroupStatus } from '../../domain/entities/school-group.entity.js';
import { SchoolGroup } from '../../domain/entities/school-group.entity.js';

type PrismaSchoolGroupMember = {
  id: string;
  groupId: string;
  userId: string;
  addedAt: Date;
};

type PrismaSchoolGroup = {
  id: string;
  schoolId: string;
  name: string;
  description: string | null;
  status: string;
  mode: string;
  courseId: string | null;
  lang: string | null;
  level: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  members: PrismaSchoolGroupMember[];
};

export class SchoolGroupMapper {
  static toDomain(raw: PrismaSchoolGroup): SchoolGroup {
    return SchoolGroup.rehydrate({
      id: raw.id,
      schoolId: raw.schoolId,
      name: raw.name,
      description: raw.description,
      status: raw.status as GroupStatus,
      mode: raw.mode as GroupMode,
      courseId: raw.courseId,
      lang: raw.lang,
      level: raw.level,
      capacityMin: raw.capacityMin,
      capacityMax: raw.capacityMax,
      startDate: raw.startDate,
      endDate: raw.endDate,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
      members: raw.members.map((m) => ({
        id: m.id,
        groupId: m.groupId,
        userId: m.userId,
        addedAt: m.addedAt,
      })),
    });
  }
}
