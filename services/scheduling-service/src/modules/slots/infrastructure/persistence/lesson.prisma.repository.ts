import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { LessonMapper } from './lesson.mapper.js';
import type {
  ILessonRepository,
  LessonPatch,
  NewLesson,
} from '../../domain/repositories/lesson.repository.interface.js';
import type { Lesson, LessonScore, LessonStatus } from '../../domain/entities/lesson.entity.js';

/** Columns written when a lesson is created. Scores never are — they arrive later. */
function toRow(l: NewLesson) {
  return {
    groupId: l.groupId,
    schoolId: l.schoolId,
    slotId: l.slotId,
    date: l.date,
    startTime: l.startTime,
    endTime: l.endTime,
    teacherId: l.teacherId,
    room: l.room,
    status: l.status,
    type: l.type,
    curriculumUnitId: l.curriculumUnitId,
    contentUnitId: l.contentUnitId,
    contentLessonId: l.contentLessonId,
    attendance: l.attendance,
    note: l.note,
    extra: l.extra,
    planIndex: l.planIndex,
    passMark: l.passMark,
  };
}

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

  async findAllByGroup(groupId: string): Promise<Lesson[]> {
    const rows = await this.prisma.lesson.findMany({
      where: { groupId },
      include: { scores: true },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return rows.map(LessonMapper.toDomain);
  }

  async findById(id: string): Promise<Lesson | null> {
    const row = await this.prisma.lesson.findUnique({ where: { id }, include: { scores: true } });
    return row ? LessonMapper.toDomain(row) : null;
  }

  async createMany(lessons: NewLesson[]): Promise<Lesson[]> {
    if (!lessons.length) return [];
    const rows = await this.prisma.$transaction(
      lessons.map((l) => this.prisma.lesson.create({ data: toRow(l) })),
    );
    return rows.map(LessonMapper.toDomain);
  }

  async create(lesson: NewLesson): Promise<Lesson> {
    const row = await this.prisma.lesson.create({ data: toRow(lesson) });
    return LessonMapper.toDomain(row);
  }

  async deleteFutureScheduled(groupId: string, fromDate: Date): Promise<void> {
    await this.prisma.lesson.deleteMany({
      where: { groupId, date: { gte: fromDate }, status: 'scheduled' },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.lesson.delete({ where: { id } });
  }

  async update(id: string, fields: LessonPatch): Promise<Lesson> {
    const row = await this.prisma.lesson.update({
      where: { id },
      data: fields,
      include: { scores: true },
    });
    return LessonMapper.toDomain(row);
  }

  async replaceScores(lessonId: string, scores: LessonScore[]): Promise<Lesson> {
    // Written as one transaction so a half-entered set of marks never becomes
    // the group's result. Students absent from the payload lose their row: the
    // caller sends the roster it graded, and a mark for someone no longer in
    // the group is not a mark worth keeping.
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.lessonScore.deleteMany({
        where: { lessonId, studentId: { notIn: scores.map((s) => s.studentId) } },
      });
      for (const { studentId, score } of scores) {
        await tx.lessonScore.upsert({
          where: { lessonId_studentId: { lessonId, studentId } },
          create: { lessonId, studentId, score },
          update: { score },
        });
      }
      return tx.lesson.findUniqueOrThrow({ where: { id: lessonId }, include: { scores: true } });
    });
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
