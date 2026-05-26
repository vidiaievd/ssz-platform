import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { ITutoringGroupRepository } from '../../domain/repositories/tutoring-group.repository.interface.js';
import type { TutoringGroup } from '../../domain/entities/tutoring-group.entity.js';
import { TutoringGroupMapper } from './tutoring-group.mapper.js';

const INCLUDE_STUDENTS = { students: true } as const;

@Injectable()
export class TutoringGroupPrismaRepository implements ITutoringGroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<TutoringGroup | null> {
    const raw = await (this.prisma as any).tutoringGroup.findUnique({
      where: { id },
      include: INCLUDE_STUDENTS,
    });
    return raw ? TutoringGroupMapper.toDomain(raw) : null;
  }

  async findByTutorId(tutorId: string): Promise<TutoringGroup | null> {
    const raw = await (this.prisma as any).tutoringGroup.findUnique({
      where: { tutorId },
      include: INCLUDE_STUDENTS,
    });
    return raw ? TutoringGroupMapper.toDomain(raw) : null;
  }

  async findByStudentId(userId: string): Promise<TutoringGroup | null> {
    const raw = await (this.prisma as any).tutoringGroup.findFirst({
      where: {
        deletedAt: null,
        students: { some: { userId } },
      },
      include: INCLUDE_STUDENTS,
    });
    return raw ? TutoringGroupMapper.toDomain(raw) : null;
  }

  async save(group: TutoringGroup): Promise<void> {
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.tutoringGroup.upsert({
        where: { id: group.id },
        create: {
          id: group.id,
          tutorId: group.tutorId,
          name: group.name ?? null,
          description: group.description ?? null,
          avatarUrl: group.avatarUrl ?? null,
          isActive: group.isActive,
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          deletedAt: group.deletedAt ?? null,
        },
        update: {
          name: group.name ?? null,
          description: group.description ?? null,
          avatarUrl: group.avatarUrl ?? null,
          isActive: group.isActive,
          updatedAt: group.updatedAt,
          deletedAt: group.deletedAt ?? null,
        },
      });

      // Sync students: delete all and recreate from domain state
      await tx.tutoringStudent.deleteMany({ where: { tutorGroupId: group.id } });

      const students = group.students;
      if (students.length > 0) {
        await tx.tutoringStudent.createMany({
          data: students.map((s) => ({
            id: s.id,
            tutorGroupId: s.tutorGroupId,
            userId: s.userId,
            joinedAt: s.joinedAt,
          })),
        });
      }
    });
  }
}
