import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISchoolGroupRepository } from '../../domain/repositories/school-group.repository.interface.js';
import type { SchoolGroup } from '../../domain/entities/school-group.entity.js';
import { SchoolGroupMapper } from './school-group.mapper.js';

const GROUP_INCLUDE = { members: true, teachers: true } as const;

@Injectable()
export class SchoolGroupPrismaRepository implements ISchoolGroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<SchoolGroup | null> {
    const raw = await (this.prisma as any).schoolGroup.findUnique({
      where: { id },
      include: GROUP_INCLUDE,
    });
    return raw ? SchoolGroupMapper.toDomain(raw) : null;
  }

  async findBySchoolId(schoolId: string): Promise<SchoolGroup[]> {
    const rows = await (this.prisma as any).schoolGroup.findMany({
      where: { schoolId, deletedAt: null },
      include: GROUP_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(SchoolGroupMapper.toDomain);
  }

  async save(group: SchoolGroup): Promise<void> {
    await (this.prisma as any).schoolGroup.upsert({
      where: { id: group.id },
      create: {
        id: group.id,
        schoolId: group.schoolId,
        name: group.name,
        description: group.description ?? null,
        status: group.status,
        mode: group.mode,
        courseId: group.courseId ?? null,
        lang: group.lang ?? null,
        level: group.level ?? null,
        capacityMin: group.capacityMin ?? null,
        capacityMax: group.capacityMax ?? null,
        startDate: group.startDate ?? null,
        endDate: group.endDate ?? null,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        deletedAt: group.deletedAt ?? null,
      },
      update: {
        name: group.name,
        description: group.description ?? null,
        status: group.status,
        mode: group.mode,
        courseId: group.courseId ?? null,
        lang: group.lang ?? null,
        level: group.level ?? null,
        capacityMin: group.capacityMin ?? null,
        capacityMax: group.capacityMax ?? null,
        startDate: group.startDate ?? null,
        endDate: group.endDate ?? null,
        updatedAt: group.updatedAt,
        deletedAt: group.deletedAt ?? null,
      },
    });
  }

  async saveWithMember(group: SchoolGroup, userId: string, memberId: string): Promise<void> {
    await (this.prisma as any).schoolGroupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      create: {
        id: memberId,
        groupId: group.id,
        userId,
        addedAt: new Date(),
      },
      update: {},
    });
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await (this.prisma as any).schoolGroupMember.deleteMany({
      where: { groupId, userId },
    });
  }
}
