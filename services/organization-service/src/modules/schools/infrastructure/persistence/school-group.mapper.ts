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
