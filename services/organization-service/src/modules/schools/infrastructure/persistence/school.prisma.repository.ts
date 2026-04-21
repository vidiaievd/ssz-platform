import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISchoolRepository } from '../../domain/repositories/school.repository.interface.js';
import type { School } from '../../domain/entities/school.entity.js';
import { SchoolMapper } from './school.mapper.js';

const INCLUDE_MEMBERS = { members: true } as const;

@Injectable()
export class SchoolPrismaRepository implements ISchoolRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findUnique({
      where: { id },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  async findByName(name: string): Promise<School | null> {
    const raw = await (this.prisma as any).school.findFirst({
      where: { name, deletedAt: null },
      include: INCLUDE_MEMBERS,
    });
    return raw ? SchoolMapper.toDomain(raw) : null;
  }

  async findByOwnerId(ownerId: string): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      where: { ownerId, deletedAt: null },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async findMemberSchools(userId: string): Promise<School[]> {
    const rows = await (this.prisma as any).school.findMany({
      where: {
        deletedAt: null,
        members: { some: { userId } },
      },
      include: INCLUDE_MEMBERS,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(SchoolMapper.toDomain);
  }

  async save(school: School): Promise<void> {
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.school.upsert({
        where: { id: school.id },
        create: {
          id: school.id,
          name: school.name,
          description: school.description ?? null,
          ownerId: school.ownerId,
          avatarUrl: school.avatarUrl ?? null,
          isActive: school.isActive,
          requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
          defaultExplanationLanguage: school.defaultExplanationLanguage ?? null,
          createdAt: school.createdAt,
          updatedAt: school.updatedAt,
          deletedAt: school.deletedAt ?? null,
        },
        update: {
          name: school.name,
          description: school.description ?? null,
          avatarUrl: school.avatarUrl ?? null,
          isActive: school.isActive,
          requireTutorReviewForSelfPaced: school.requireTutorReviewForSelfPaced,
          defaultExplanationLanguage: school.defaultExplanationLanguage ?? null,
          updatedAt: school.updatedAt,
          deletedAt: school.deletedAt ?? null,
        },
      });

      // Sync members: delete all and recreate from domain state
      await tx.schoolMember.deleteMany({ where: { schoolId: school.id } });

      const members = school.members;
      if (members.length > 0) {
        await tx.schoolMember.createMany({
          data: members.map((m) => ({
            id: m.id,
            schoolId: m.schoolId,
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
          })),
        });
      }
    });
  }
}
