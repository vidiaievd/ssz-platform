import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { OrgServiceHttpClient } from '../../../../infrastructure/org/org-service.http-client.js';
import { ProfileServiceHttpClient } from '../../../../infrastructure/profile/profile-service.http-client.js';

export interface SubstitutionCandidate {
  teacherId: string;
  eligible: boolean;
  fitScore: number;
  reasons: string[];
  capScore: number;
  famScore: number;
  disrScore: number;
  availScore: number;
}

interface RequestContext {
  schoolId: string;
  groupId: string;
  lessonId: string;
  coverFrom: Date;
  coverTo: Date;
  requiredLanguage?: string;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

@Injectable()
export class CandidateRankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgClient: OrgServiceHttpClient,
    private readonly profileClient: ProfileServiceHttpClient,
  ) {}

  async rankCandidates(requestId: string): Promise<SubstitutionCandidate[]> {
    const request = await this.prisma.substituteRequest.findUnique({
      where: { id: requestId },
      include: { lesson: true },
    });
    if (!request) return [];

    const groupInfo = await this.orgClient.getGroup(request.schoolId, request.groupId);

    const ctx: RequestContext = {
      schoolId: request.schoolId,
      groupId: request.groupId,
      lessonId: request.lessonId,
      coverFrom: request.coverFrom,
      coverTo: request.coverTo,
      requiredLanguage: groupInfo?.lang ?? undefined,
    };

    const [allTeachers, policyRow] = await Promise.all([
      this.orgClient.getSchoolTeachers(ctx.schoolId),
      this.prisma.workloadPolicy.findUnique({ where: { schoolId: ctx.schoolId } }),
    ]);

    const dailyCap = policyRow?.dailyContactCap ?? 6.0;

    const candidates = await Promise.all(
      allTeachers
        .filter((t) => t.userId !== request.originalTeacherId)
        .map((t) => this.scoreCandidate(t, ctx, dailyCap, request.lesson)),
    );

    return candidates.sort((a, b) => b.fitScore - a.fitScore);
  }

  private async scoreCandidate(
    teacher: { userId: string; maxWeeklyHours: number | null; availability: Array<{ weekday: number; start: string; end: string }> },
    ctx: RequestContext,
    dailyCap: number,
    lesson: { date: Date; startTime: string; endTime: string; groupId: string },
  ): Promise<SubstitutionCandidate> {
    const reasons: string[] = [];

    // Language-fit: ineligible if group requires a language the teacher doesn't teach
    if (ctx.requiredLanguage) {
      const teachingLangs = await this.profileClient.getTeachingLanguages(teacher.userId);
      if (teachingLangs.length > 0 && !teachingLangs.includes(ctx.requiredLanguage)) {
        reasons.push('language-mismatch');
        return { teacherId: teacher.userId, eligible: false, fitScore: 0, reasons, capScore: 0, famScore: 0, disrScore: 0, availScore: 0 };
      }
    }

    // G2: Check if teacher is free during lesson time on that day
    const lessonDate = lesson.date;
    const conflicts = await this.prisma.lesson.findMany({
      where: {
        teacherId: teacher.userId,
        date: lessonDate,
        status: { not: 'cancelled' },
      },
    });

    const lessonStart = timeToMinutes(lesson.startTime);
    const lessonEnd = timeToMinutes(lesson.endTime);
    const hasConflict = conflicts.some((c) => {
      const cStart = timeToMinutes(c.startTime);
      const cEnd = timeToMinutes(c.endTime);
      return lessonStart < cEnd && cStart < lessonEnd;
    });

    if (hasConflict) {
      reasons.push('schedule-conflict');
      return { teacherId: teacher.userId, eligible: false, fitScore: 0, reasons, capScore: 0, famScore: 0, disrScore: 0, availScore: 0 };
    }

    // Capacity score (0-40): spare daily capacity
    const dayLessons = await this.prisma.lesson.findMany({
      where: { teacherId: teacher.userId, date: lessonDate, status: { not: 'cancelled' } },
    });
    const usedHours = dayLessons.reduce((acc, l) => {
      return acc + (timeToMinutes(l.endTime) - timeToMinutes(l.startTime)) / 60;
    }, 0);
    const lessonDuration = (lessonEnd - lessonStart) / 60;
    const spare = dailyCap - usedHours - lessonDuration;
    const capScore = Math.min(40, Math.max(0, (spare / dailyCap) * 40));

    // Familiarity score (0-25): has taught this group before
    const prevLessons = await this.prisma.lesson.count({
      where: { teacherId: teacher.userId, groupId: ctx.groupId, status: { not: 'cancelled' } },
    });
    const famScore = prevLessons > 0 ? Math.min(25, prevLessons * 5) : 0;
    if (famScore > 0) reasons.push('familiar-with-group');

    // Disruption score (0-20): penalize if already substituting in this window
    const subCount = await this.prisma.substituteAssignment.count({
      where: {
        substituteTeacherId: teacher.userId,
        coverFrom: { lte: ctx.coverTo },
        coverTo: { gte: ctx.coverFrom },
        status: { in: ['proposed', 'confirmed'] },
      },
    });
    const disrScore = Math.max(0, 20 - subCount * 5);

    // Availability score (0-15): availability window match
    const lessonWeekday = lessonDate.getDay();
    const avail = teacher.availability?.find((a) => a.weekday === lessonWeekday);
    let availScore = 0;
    if (avail) {
      const availStart = timeToMinutes(avail.start);
      const availEnd = timeToMinutes(avail.end);
      if (availStart <= lessonStart && lessonEnd <= availEnd) {
        availScore = 15;
        reasons.push('within-availability');
      }
    }

    const fitScore = Math.round(capScore + famScore + disrScore + availScore);
    return { teacherId: teacher.userId, eligible: true, fitScore, reasons, capScore, famScore, disrScore, availScore };
  }
}
