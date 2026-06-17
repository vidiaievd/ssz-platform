import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ISchoolGroupRepository } from '../../domain/repositories/school-group.repository.interface.js';
import type { SchoolGroup } from '../../domain/entities/school-group.entity.js';
import { SchoolGroupMapper } from './school-group.mapper.js';

// The aggregate only ever sees active members — capacity checks, roster, and
// publish validation must not count past (exited) memberships. History queries
// for the Student Detail Page read school_group_members directly, bypassing this aggregate.
const GROUP_INCLUDE = { members: { where: { status: 'active' as const } }, teachers: true } as const;

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

  async findActiveGroupsWithPrimaryTeacher(schoolId: string, userId: string): Promise<SchoolGroup[]> {
    const rows = await (this.prisma as any).schoolGroup.findMany({
      where: {
        schoolId,
        status: 'active',
        deletedAt: null,
        teachers: { some: { userId, role: 'primary' } },
      },
      include: GROUP_INCLUDE,
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

  async saveWithMember(
    group: SchoolGroup,
    userId: string,
    memberId: string,
    role: 'student' | 'trial' | 'observer' = 'student',
  ): Promise<void> {
    await (this.prisma as any).schoolGroupMember.upsert({
      where: { groupId_userId: { groupId: group.id, userId } },
      create: {
        id: memberId,
        groupId: group.id,
        userId,
        role,
        addedAt: new Date(),
      },
      // Re-adding a former member: reopen as a new membership period.
      update: {
        role,
        status: 'active',
        addedAt: new Date(),
        exitedAt: null,
      },
    });
  }

  async removeMember(groupId: string, userId: string): Promise<void> {
    await (this.prisma as any).schoolGroupMember.updateMany({
      where: { groupId, userId, status: 'active' },
      data: { status: 'past', exitedAt: new Date() },
    });
  }
}
