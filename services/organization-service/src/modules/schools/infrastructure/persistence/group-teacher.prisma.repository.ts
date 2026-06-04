import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { IGroupTeacherRepository } from '../../domain/repositories/group-teacher.repository.interface.js';
import type { GroupTeacherProps, GroupTeacherRole } from '../../domain/entities/school-group.entity.js';

@Injectable()
export class GroupTeacherPrismaRepository implements IGroupTeacherRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGroupId(groupId: string): Promise<GroupTeacherProps[]> {
    const rows = await (this.prisma as any).groupTeacher.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(this.toProps);
  }

  async findByGroupAndUser(
    groupId: string,
    userId: string,
    role: GroupTeacherRole,
  ): Promise<GroupTeacherProps | null> {
    const row = await (this.prisma as any).groupTeacher.findUnique({
      where: { groupId_userId_role: { groupId, userId, role } },
    });
    return row ? this.toProps(row) : null;
  }

  async save(teacher: GroupTeacherProps): Promise<void> {
    await (this.prisma as any).groupTeacher.upsert({
      where: { groupId_userId_role: { groupId: teacher.groupId, userId: teacher.userId, role: teacher.role } },
      create: {
        id: teacher.id,
        groupId: teacher.groupId,
        userId: teacher.userId,
        role: teacher.role,
        fromDate: teacher.fromDate ?? null,
        toDate: teacher.toDate ?? null,
        reason: teacher.reason ?? null,
        createdAt: teacher.createdAt,
      },
      update: {
        fromDate: teacher.fromDate ?? null,
        toDate: teacher.toDate ?? null,
        reason: teacher.reason ?? null,
      },
    });
  }

  async remove(groupId: string, userId: string, role: GroupTeacherRole): Promise<void> {
    await (this.prisma as any).groupTeacher.deleteMany({
      where: { groupId, userId, role },
    });
  }

  async removeAllForGroup(groupId: string): Promise<void> {
    await (this.prisma as any).groupTeacher.deleteMany({ where: { groupId } });
  }

  private toProps(row: any): GroupTeacherProps {
    return {
      id: row.id,
      groupId: row.groupId,
      userId: row.userId,
      role: row.role as GroupTeacherRole,
      fromDate: row.fromDate ?? null,
      toDate: row.toDate ?? null,
      reason: row.reason ?? null,
      createdAt: row.createdAt,
    };
  }
}
