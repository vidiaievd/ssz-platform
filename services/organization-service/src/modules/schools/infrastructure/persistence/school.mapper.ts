import { School } from '../../domain/entities/school.entity.js';
import { SchoolMember } from '../../domain/entities/school-member.entity.js';

type PrismaSchoolMember = {
  id: string;
  schoolId: string;
  userId: string;
  role: string;
  joinedAt: Date;
};

type PrismaSchool = {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  members: PrismaSchoolMember[];
};

export class SchoolMapper {
  static toDomain(raw: PrismaSchool): School {
    const members = raw.members.map((m) =>
      SchoolMember.rehydrate({
        id: m.id,
        schoolId: m.schoolId,
        userId: m.userId,
        role: m.role as any,
        joinedAt: m.joinedAt,
      }),
    );

    return School.rehydrate({
      id: raw.id,
      name: raw.name,
      description: raw.description ?? undefined,
      ownerId: raw.ownerId,
      avatarUrl: raw.avatarUrl ?? undefined,
      isActive: raw.isActive,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt ?? undefined,
      members,
    });
  }
}
