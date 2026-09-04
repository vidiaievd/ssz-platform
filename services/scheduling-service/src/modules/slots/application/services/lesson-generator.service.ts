import { Injectable, Inject } from '@nestjs/common';
import { LESSON_REPOSITORY, type ILessonRepository } from '../../domain/repositories/lesson.repository.interface.js';
import {
  CURRICULUM_PLAN_READER,
  type ICurriculumPlanReader,
  type PlannedUnit,
} from '../ports/curriculum-plan.reader.js';
import type { Slot, WeekDay } from '../../domain/entities/slot.entity.js';
import type { Lesson } from '../../domain/entities/lesson.entity.js';

const WEEKDAY_JS: Record<WeekDay, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

export interface GenerateLessonsInput {
  groupId: string;
  schoolId: string;
  teacherId: string;
  slots: Slot[];
  startDate: Date;
  endDate: Date;
}

/**
 * Hands out one unit id per lesson, in plan order: a unit claims as many lessons
 * as it still has sessions left to teach, then the next unit takes over. Lessons
 * past the end of the plan get null — a plan that runs out is a fact about the
 * plan, not something to paper over by repeating its last unit.
 */
function unitForEachLesson(units: PlannedUnit[], lessonCount: number): Array<string | null> {
  const assignment: Array<string | null> = [];

  for (const unit of units) {
    const remaining = Math.max(unit.plannedSessions - unit.deliveredSessions, 0);
    for (let i = 0; i < remaining && assignment.length < lessonCount; i++) {
      assignment.push(unit.id);
    }
    if (assignment.length >= lessonCount) break;
  }

  while (assignment.length < lessonCount) assignment.push(null);
  return assignment;
}

@Injectable()
export class LessonGeneratorService {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    @Inject(CURRICULUM_PLAN_READER) private readonly plan: ICurriculumPlanReader,
  ) {}

  async generate(input: GenerateLessonsInput): Promise<Lesson[]> {
    const { groupId, schoolId, teacherId, slots, startDate, endDate } = input;
    if (!slots.length) return [];

    const byWeekday = new Map<number, Slot[]>();
    for (const slot of slots) {
      const day = WEEKDAY_JS[slot.weekday];
      if (!byWeekday.has(day)) byWeekday.set(day, []);
      byWeekday.get(day)!.push(slot);
    }

    const toCreate: Array<Omit<Lesson, 'id'>> = [];
    const cursor = new Date(startDate);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    while (cursor <= end) {
      const daySlots = byWeekday.get(cursor.getDay());
      if (daySlots) {
        for (const slot of daySlots) {
          toCreate.push({
            groupId,
            schoolId,
            slotId: slot.id,
            date: new Date(cursor),
            startTime: slot.startTime,
            endTime: slot.endTime,
            teacherId,
            room: slot.room,
            status: 'scheduled',
            curriculumUnitId: null, // filled in below, once the whole run is known
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!toCreate.length) return [];

    // Attach the plan. Lessons were built in date order, so plan order and
    // calendar order line up; the teacher can still repoint any single lesson.
    const units = await this.plan.unitsForGroup(groupId);
    if (units.length) {
      const assignment = unitForEachLesson(units, toCreate.length);
      toCreate.forEach((lesson, i) => {
        (lesson as { curriculumUnitId: string | null }).curriculumUnitId = assignment[i] ?? null;
      });
    }

    return this.lessons.createMany(toCreate);
  }
}
