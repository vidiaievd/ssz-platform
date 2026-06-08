import { Injectable, Inject } from '@nestjs/common';
import { LESSON_REPOSITORY, type ILessonRepository } from '../../domain/repositories/lesson.repository.interface.js';
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

@Injectable()
export class LessonGeneratorService {
  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
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
            curriculumUnitId: null,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    if (!toCreate.length) return [];
    return this.lessons.createMany(toCreate);
  }
}
