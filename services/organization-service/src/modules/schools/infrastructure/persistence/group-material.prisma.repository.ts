import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { IGroupMaterialRepository } from '../../domain/repositories/group-material.repository.interface.js';
import type { GroupMaterialProps } from '../../domain/entities/school-group.entity.js';

@Injectable()
export class GroupMaterialPrismaRepository implements IGroupMaterialRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGroupId(groupId: string): Promise<GroupMaterialProps[]> {
    const rows = await (this.prisma as any).groupMaterial.findMany({
      where: { groupId },
      orderBy: { addedAt: 'asc' },
    });
    return rows.map(this.toProps);
  }

  async findByGroupAndCourse(groupId: string, courseId: string): Promise<GroupMaterialProps | null> {
    const row = await (this.prisma as any).groupMaterial.findUnique({
      where: { groupId_courseId: { groupId, courseId } },
    });
    return row ? this.toProps(row) : null;
  }

  async add(material: GroupMaterialProps): Promise<void> {
    await (this.prisma as any).groupMaterial.create({
      data: {
        id: material.id,
        groupId: material.groupId,
        courseId: material.courseId,
        addedAt: material.addedAt,
      },
    });
  }

  async remove(groupId: string, materialId: string): Promise<void> {
    await (this.prisma as any).groupMaterial.deleteMany({
      where: { id: materialId, groupId },
    });
  }

  async removeAllForGroup(groupId: string): Promise<void> {
    await (this.prisma as any).groupMaterial.deleteMany({ where: { groupId } });
  }

  private toProps(row: any): GroupMaterialProps {
    return {
      id: row.id,
      groupId: row.groupId,
      courseId: row.courseId,
      addedAt: row.addedAt,
    };
  }
}
