import { School } from '../../domain/entities/school.entity.js';
import { SchoolMember } from '../../domain/entities/school-member.entity.js';
import { SchoolType } from '../../domain/value-objects/school-type.vo.js';

type PrismaSchoolMember = {
  id: string;
  schoolId: string;
  userId: string;
  role: string;
  joinedAt: Date;
  name?: string | null;
  avatarUrl?: string | null;
};

type PrismaSchool = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  ownerId: string;
  avatarUrl: string | null;
  website: string | null;
  contactEmail: string | null;
  city: string | null;
  type: string;
  isActive: boolean;
  requireTutorReviewForSelfPaced: boolean;
  defaultExplanationLanguage: string | null;
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
        name: m.name,
        avatarUrl: m.avatarUrl,
      }),
    );

    return School.rehydrate({
      id: raw.id,
      name: raw.name,
      slug: raw.slug,
      description: raw.description ?? undefined,
      ownerId: raw.ownerId,
      avatarUrl: raw.avatarUrl ?? undefined,
      website: raw.website ?? undefined,
      contactEmail: raw.contactEmail ?? undefined,
      city: raw.city ?? undefined,
      type: (raw.type as SchoolType) ?? SchoolType.ONLINE,
      isActive: raw.isActive,
      requireTutorReviewForSelfPaced: raw.requireTutorReviewForSelfPaced,
      defaultExplanationLanguage: raw.defaultExplanationLanguage ?? undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt ?? undefined,
      members,
    });
  }
}
