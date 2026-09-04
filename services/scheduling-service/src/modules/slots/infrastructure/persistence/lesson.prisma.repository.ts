import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { LessonMapper } from './lesson.mapper.js';
import type { ILessonRepository } from '../../domain/repositories/lesson.repository.interface.js';
import type { Lesson, LessonStatus } from '../../domain/entities/lesson.entity.js';

@Injectable()
export class LessonPrismaRepository implements ILessonRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByGroup(groupId: string, from: Date, to: Date): Promise<Lesson[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { groupId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(LessonMapper.toDomain);
  }

  async findById(id: string): Promise<Lesson | null> {
    const row = await this.prisma.lesson.findUnique({ where: { id } });
    return row ? LessonMapper.toDomain(row) : null;
  }

  async createMany(lessons: Array<Omit<Lesson, 'id'>>): Promise<Lesson[]> {
    if (!lessons.length) return [];
    const rows = await this.prisma.$transaction(
      lessons.map((l) =>
        this.prisma.lesson.create({
          data: {
            groupId: l.groupId,
            schoolId: l.schoolId,
            slotId: l.slotId,
            date: l.date,
            startTime: l.startTime,
            endTime: l.endTime,
            teacherId: l.teacherId,
            room: l.room,
            status: l.status,
            curriculumUnitId: l.curriculumUnitId,
          },
        }),
      ),
    );
    return rows.map(LessonMapper.toDomain);
  }

  async deleteFutureScheduled(groupId: string, fromDate: Date): Promise<void> {
    await this.prisma.lesson.deleteMany({
      where: { groupId, date: { gte: fromDate }, status: 'scheduled' },
    });
  }

  async update(
    id: string,
    fields: Partial<Pick<Lesson, 'status' | 'room' | 'curriculumUnitId' | 'teacherId'>>,
  ): Promise<Lesson> {
    const row = await this.prisma.lesson.update({ where: { id }, data: fields });
    return LessonMapper.toDomain(row);
  }

  async countByTeacher(teacherId: string, from: Date, to: Date): Promise<number> {
    return this.prisma.lesson.count({
      where: { teacherId, date: { gte: from, lte: to }, status: { not: 'cancelled' } },
    });
  }

  async findNextForGroup(groupId: string, limit: number): Promise<Lesson[]> {
    const now = new Date();
    const rows = await this.prisma.lesson.findMany({
      // Held lessons are history even when their date is today: they are not upcoming.
      where: { groupId, date: { gte: now }, status: { notIn: ['cancelled', 'held'] } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: limit,
    });
    return rows.map(LessonMapper.toDomain);
  }

  async findBySchoolAndDateRange(schoolId: string, from: Date, to: Date): Promise<Lesson[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { schoolId, date: { gte: from, lte: to } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(LessonMapper.toDomain);
  }

  async findByTeacherAndDateRange(teacherId: string, from: Date, to: Date): Promise<Lesson[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { teacherId, date: { gte: from, lte: to }, status: { not: 'cancelled' } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(LessonMapper.toDomain);
  }

  async updateStatus(ids: string[], status: LessonStatus): Promise<void> {
    await this.prisma.lesson.updateMany({ where: { id: { in: ids } }, data: { status } });
  }
}
