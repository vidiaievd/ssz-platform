import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { LESSON_REPOSITORY, type ILessonRepository } from '../../../slots/domain/repositories/lesson.repository.interface.js';
import type { Lesson } from '../../../slots/domain/entities/lesson.entity.js';

export type HealthState = 'ok' | 'warn' | 'danger';

export interface WorkloadPolicyValues {
  prepFactor: number;
  dailyContactCap: number;
  maxConsecutive: number;
  nearCapRatio: number;
}

export interface TeacherLoadSummary {
  teacherId: string;
  contactHours: number;
  prepHours: number;
  effectiveHours: number;
  distinctGroups: number;
  dailyPeak: number;
  health: HealthState;
  overloaded: boolean;
}

export interface ConflictEntry {
  teacherId: string;
  date: string;
  lessonAId: string;
  lessonBId: string;
}

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function lessonsOverlap(a: Lesson, b: Lesson): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStart = timeToMinutes(b.startTime);
  const bEnd = timeToMinutes(b.endTime);
  return aStart < bEnd && bStart < aEnd;
}

function durationHours(lesson: Lesson): number {
  return (timeToMinutes(lesson.endTime) - timeToMinutes(lesson.startTime)) / 60;
}

@Injectable()
export class WorkloadCalculatorService {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    private readonly prisma: PrismaService,
  ) {}

  async getPolicy(schoolId: string): Promise<WorkloadPolicyValues> {
    const row = await this.prisma.workloadPolicy.findUnique({ where: { schoolId } });
    return {
      prepFactor: row?.prepFactor ?? 0.3,
      dailyContactCap: row?.dailyContactCap ?? 6.0,
      maxConsecutive: row?.maxConsecutive ?? 3,
      nearCapRatio: row?.nearCapRatio ?? 0.85,
    };
  }

  async getConflicts(schoolId: string, from: Date, to: Date): Promise<ConflictEntry[]> {
    const all = await this.lessons.findBySchoolAndDateRange(schoolId, from, to);

    // Group by teacherId + date
    const byKey = new Map<string, Lesson[]>();
    for (const lesson of all) {
      if (lesson.status === 'cancelled') continue;
      const key = `${lesson.teacherId}::${lesson.date.toISOString().slice(0, 10)}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(lesson);
    }

    const conflicts: ConflictEntry[] = [];
    for (const [key, dayLessons] of byKey) {
      const [teacherId, date] = key.split('::') as [string, string];
      for (let i = 0; i < dayLessons.length; i++) {
        for (let j = i + 1; j < dayLessons.length; j++) {
          if (lessonsOverlap(dayLessons[i]!, dayLessons[j]!)) {
            conflicts.push({ teacherId, date, lessonAId: dayLessons[i]!.id, lessonBId: dayLessons[j]!.id });
          }
        }
      }
    }
    return conflicts;
  }

  async getTeacherLoad(
    teacherId: string,
    from: Date,
    to: Date,
    policy: WorkloadPolicyValues,
  ): Promise<TeacherLoadSummary> {
    const teacherLessons = await this.lessons.findByTeacherAndDateRange(teacherId, from, to);
    const active = teacherLessons.filter((l) => l.status !== 'cancelled');

    const contactHours = active.reduce((acc, l) => acc + durationHours(l), 0);
    const distinctGroups = new Set(active.map((l) => l.groupId)).size;
    const prepHours = contactHours * policy.prepFactor + distinctGroups * 1.0;
    const effectiveHours = contactHours + prepHours;

    // Daily peak contact hours
    const byDay = new Map<string, number>();
    for (const l of active) {
      const d = l.date.toISOString().slice(0, 10);
      byDay.set(d, (byDay.get(d) ?? 0) + durationHours(l));
    }
    const dailyPeak = byDay.size ? Math.max(...byDay.values()) : 0;

    const overloaded = dailyPeak > policy.dailyContactCap;
    let health: HealthState = 'ok';
    if (dailyPeak >= policy.dailyContactCap) health = 'danger';
    else if (dailyPeak >= policy.nearCapRatio * policy.dailyContactCap) health = 'warn';

    return { teacherId, contactHours, prepHours, effectiveHours, distinctGroups, dailyPeak, health, overloaded };
  }

  async getSchoolLoadSummaries(
    schoolId: string,
    from: Date,
    to: Date,
    policy: WorkloadPolicyValues,
    teacherIds: string[],
  ): Promise<TeacherLoadSummary[]> {
    return Promise.all(teacherIds.map((tid) => this.getTeacherLoad(tid, from, to, policy)));
  }
}
