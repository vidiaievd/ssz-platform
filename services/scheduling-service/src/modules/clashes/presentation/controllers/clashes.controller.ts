import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { ClashEntryDto } from '../dto/clashes.dto.js';

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

@ApiTags('Clashes')
@ApiBearerAuth()
@Controller('scheduling/schools/:schoolId/students/:userId')
export class ClashesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('clashes')
  @ApiOperation({ summary: 'Find lesson clashes for a student' })
  @ApiResponse({ status: 200, type: [ClashEntryDto] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async clashes(
    @Param('schoolId') schoolId: string,
    @Param('userId') userId: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
  ): Promise<ClashEntryDto[]> {
    const from = fromStr ? new Date(fromStr) : (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();
    const to = toStr ? new Date(toStr) : (() => { const d = new Date(from); d.setDate(d.getDate() + 30); return d; })();

    // Get all lessons for groups the student is enrolled in at this school
    const memberships = await this.prisma.schoolMembership.findMany({
      where: { schoolId, userId, role: 'STUDENT' },
    });
    if (!memberships.length) return [];

    // We don't track per-student group membership locally — query all school lessons
    // and let the caller filter. For now return all overlapping lessons within the school.
    const lessons = await this.prisma.lesson.findMany({
      where: { schoolId, date: { gte: from, lte: to }, status: { not: 'cancelled' } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });

    // Find overlapping pairs on same date for different groups
    const clashes: ClashEntryDto[] = [];
    const byDate = new Map<string, typeof lessons>();
    for (const l of lessons) {
      const d = l.date.toISOString().slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d)!.push(l);
    }

    for (const [date, dayLessons] of byDate) {
      for (let i = 0; i < dayLessons.length; i++) {
        for (let j = i + 1; j < dayLessons.length; j++) {
          const a = dayLessons[i]!;
          const b = dayLessons[j]!;
          if (a.groupId === b.groupId) continue;
          const aStart = timeToMinutes(a.startTime);
          const aEnd = timeToMinutes(a.endTime);
          const bStart = timeToMinutes(b.startTime);
          const bEnd = timeToMinutes(b.endTime);
          if (aStart < bEnd && bStart < aEnd) {
            clashes.push({
              lessonAId: a.id,
              lessonBId: b.id,
              date,
              groupAId: a.groupId,
              groupBId: b.groupId,
              startTime: a.startTime,
            });
          }
        }
      }
    }
    return clashes;
  }
}
