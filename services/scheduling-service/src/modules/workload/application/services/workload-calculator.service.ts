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

export interface ProposedSlot {
  weekday: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  startTime: string;
  endTime: string;
}

export interface TeacherAvailabilityEntry {
  teacherId: string;
  status: 'free' | 'conflict' | 'absent';
  conflictGroupId?: string | null;
  absenceId?: string | null;
}

export interface TeacherTimetableEntry {
  weekday: ProposedSlot['weekday'];
  startTime: string;
  endTime: string;
  groupId: string;
  room: string | null;
}

const WEEKDAY_JS: Record<ProposedSlot['weekday'], number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

const JS_WEEKDAY = Object.fromEntries(
  Object.entries(WEEKDAY_JS).map(([day, jsDay]) => [jsDay, day as ProposedSlot['weekday']]),
) as Record<number, ProposedSlot['weekday']>;

const AVAILABILITY_HORIZON_DAYS = 13; // covers every weekday at least once
const TIMETABLE_HORIZON_DAYS = 13; // same — one weekly cycle is enough to derive the recurring pattern

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

  /**
   * Derived availability: no positive-availability calendar exists, so a teacher
   * is "free" for a proposed weekly slot set unless a future Lesson (other group)
   * overlaps one of the slots, or an absence currently covers today.
   */
  async getAvailability(
    schoolId: string,
    teacherIds: string[],
    proposedSlots: ProposedSlot[],
  ): Promise<TeacherAvailabilityEntry[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + AVAILABILITY_HORIZON_DAYS);

    const [futureLessons, activeAbsences] = await Promise.all([
      this.lessons.findBySchoolAndDateRange(schoolId, today, horizon),
      this.prisma.teacherAbsence.findMany({
        where: {
          schoolId,
          fromDate: { lte: today },
          OR: [{ toDate: null }, { toDate: { gte: today } }],
        },
      }),
    ]);

    const absenceByTeacher = new Map<string, { id: string }>();
    for (const absence of activeAbsences) {
      if (!absenceByTeacher.has(absence.teacherId)) absenceByTeacher.set(absence.teacherId, { id: absence.id });
    }

    const lessonsByTeacher = new Map<string, Lesson[]>();
    for (const lesson of futureLessons) {
      if (lesson.status === 'cancelled') continue;
      if (!lessonsByTeacher.has(lesson.teacherId)) lessonsByTeacher.set(lesson.teacherId, []);
      lessonsByTeacher.get(lesson.teacherId)!.push(lesson);
    }

    return teacherIds.map((teacherId) => {
      const absence = absenceByTeacher.get(teacherId);
      if (absence) {
        return { teacherId, status: 'absent', absenceId: absence.id };
      }

      const lessons = lessonsByTeacher.get(teacherId) ?? [];
      for (const slot of proposedSlots) {
        const slotDay = WEEKDAY_JS[slot.weekday];
        const slotStart = timeToMinutes(slot.startTime);
        const slotEnd = timeToMinutes(slot.endTime);
        const conflicting = lessons.find((l) => {
          if (l.date.getDay() !== slotDay) return false;
          const lStart = timeToMinutes(l.startTime);
          const lEnd = timeToMinutes(l.endTime);
          return slotStart < lEnd && lStart < slotEnd;
        });
        if (conflicting) {
          return { teacherId, status: 'conflict', conflictGroupId: conflicting.groupId };
        }
      }

      return { teacherId, status: 'free' };
    });
  }

  /**
   * Pure read projection over the future Lessons assigned to this teacher —
   * never edited directly. Dedupes occurrences of the same recurring slot
   * (same weekday/time/group) into a single weekly entry.
   */
  async getTeacherTimetable(teacherId: string): Promise<TeacherTimetableEntry[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + TIMETABLE_HORIZON_DAYS);

    const lessons = await this.lessons.findByTeacherAndDateRange(teacherId, today, horizon);

    const seen = new Map<string, TeacherTimetableEntry>();
    for (const lesson of lessons) {
      if (lesson.status === 'cancelled') continue;
      const weekday = JS_WEEKDAY[lesson.date.getDay()]!;
      const key = `${weekday}::${lesson.startTime}::${lesson.endTime}::${lesson.groupId}`;
      if (!seen.has(key)) {
        seen.set(key, {
          weekday,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          groupId: lesson.groupId,
          room: lesson.room,
        });
      }
    }

    return [...seen.values()].sort((a, b) => {
      if (a.weekday !== b.weekday) return WEEKDAY_JS[a.weekday] - WEEKDAY_JS[b.weekday];
      return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
    });
  }
}
