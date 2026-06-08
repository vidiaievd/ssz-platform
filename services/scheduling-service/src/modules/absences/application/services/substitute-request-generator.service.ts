import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { TeacherAbsence } from '../../domain/entities/teacher-absence.entity.js';

@Injectable()
export class SubstituteRequestGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generateForAbsence(absence: TeacherAbsence): Promise<void> {
    const toDate = absence.toDate ?? absence.fromDate;

    // Find all scheduled lessons for the absent teacher in the absence window
    const lessons = await this.prisma.lesson.findMany({
      where: {
        teacherId: absence.teacherId,
        schoolId: absence.schoolId,
        date: { gte: absence.fromDate, lte: toDate },
        status: 'scheduled',
      },
    });

    if (!lessons.length) return;

    const now = new Date();
    const daysUntil = Math.floor((absence.fromDate.getTime() - now.getTime()) / 86_400_000);
    const urgency = daysUntil <= 0 ? 'today' : daysUntil <= 3 ? 'upcoming' : 'open';

    for (const lesson of lessons) {
      const existing = await this.prisma.substituteRequest.findFirst({
        where: { lessonId: lesson.id, status: { not: 'cancelled' } },
      });
      if (existing) continue;

      await this.prisma.substituteRequest.create({
        data: {
          schoolId: absence.schoolId,
          lessonId: lesson.id,
          absenceId: absence.id,
          groupId: lesson.groupId,
          originalTeacherId: absence.teacherId,
          coverFrom: absence.fromDate,
          coverTo: toDate,
          urgency,
          status: 'open',
        },
      });
    }
  }
}
