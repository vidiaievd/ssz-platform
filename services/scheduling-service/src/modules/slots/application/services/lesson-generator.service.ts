import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  LESSON_REPOSITORY,
  type ILessonRepository,
  type NewLesson,
} from '../../domain/repositories/lesson.repository.interface.js';
import {
  CURRICULUM_PLAN_READER,
  type ICurriculumPlanReader,
} from '../ports/curriculum-plan.reader.js';
import {
  COURSE_OUTLINE_READER,
  type ICourseOutlineReader,
} from '../ports/course-outline.reader.js';
import {
  buildPlanItems,
  layoutPlan,
  occurrenceKey,
  utcMidnight,
  type PlanSlot,
  type PlannedSession,
} from './session-plan.js';
import type { Slot } from '../../domain/entities/slot.entity.js';
import type { Lesson } from '../../domain/entities/lesson.entity.js';

export interface GenerateLessonsInput {
  groupId: string;
  schoolId: string;
  /** The group's primary teacher, or null while nobody is assigned. */
  teacherId: string | null;
  slots: Slot[];
  /** The course the group is taught from. Without one there is nothing to plan. */
  courseId: string | null;
  startDate: Date;
}

@Injectable()
export class LessonGeneratorService {
  private readonly logger = new Logger(LessonGeneratorService.name);

  constructor(
    @Inject(LESSON_REPOSITORY) private readonly lessons: ILessonRepository,
    @Inject(CURRICULUM_PLAN_READER) private readonly plan: ICurriculumPlanReader,
    @Inject(COURSE_OUTLINE_READER) private readonly course: ICourseOutlineReader,
  ) {}

  /**
   * Lays the part of a group's course that has not been taught yet over its
   * weekly slots.
   *
   * The course decides how many sessions there are — one per lesson, plus a
   * checkpoint closing each unit — and the slots decide when they fall. A group
   * with no course, or one whose course has nothing published, gets no sessions:
   * there is nothing to teach yet, and inventing dated blanks would only put
   * empty rows in the log.
   *
   * The record is left alone: lessons held, lessons cancelled, and lessons added
   * by hand stay exactly as they are, and the sessions they already account for
   * are not planned a second time. On a group with no lessons yet this is simply
   * generation from scratch, which is why there is no separate path for it.
   *
   * Called when the pattern changes, when the course changes, and when the group
   * is published — all three ask the same question of the same facts.
   */
  async regenerateTail(input: GenerateLessonsInput): Promise<Lesson[]> {
    const existing = await this.lessons.findAllByGroup(input.groupId);
    const today = utcMidnight(new Date());

    // What the group has actually lived through, plus anything a person put
    // there by hand. None of it is ours to move.
    const kept = existing.filter(
      (l) => l.extra || l.status === 'held' || l.status === 'cancelled' || l.date < today,
    );
    const settled = new Set(
      kept.filter((l) => !l.extra && l.planIndex !== null).map((l) => l.planIndex!),
    );
    const occupied = new Set(kept.map((l) => occurrenceKey(l.date, l.startTime)));

    const doomed = existing.filter((l) => !kept.includes(l));

    const from = today > input.startDate ? today : input.startDate;
    const sessions = await this.planFor(input, from, occupied, settled);

    for (const lesson of doomed) await this.lessons.delete(lesson.id);
    if (!sessions.length) return [];
    return this.lessons.createMany(sessions);
  }

  /**
   * The plan as rows ready to be written: course content laid over the slots,
   * each session pointing at the unit of the teaching plan that covers it.
   */
  private async planFor(
    input: GenerateLessonsInput,
    from: Date,
    occupied: ReadonlySet<string>,
    settled: ReadonlySet<number> = new Set(),
  ): Promise<NewLesson[]> {
    const { groupId, schoolId, teacherId, slots, courseId } = input;
    if (!slots.length || !courseId) return [];

    const outline = await this.course.forCourse(courseId);
    if (!outline?.units.length) {
      this.logger.log(`No published course content for group ${groupId} — no sessions planned`);
      return [];
    }

    const items = buildPlanItems(outline.units).filter((i) => !settled.has(i.planIndex));
    const planned = layoutPlan(items, slots.map(toPlanSlot), from, occupied);
    const unitByContentUnit = await this.stitchedPlanUnits(groupId);

    return planned.map((session) => toNewLesson(session, groupId, schoolId, teacherId, unitByContentUnit));
  }

  /**
   * Which unit of the group's teaching plan teaches which unit of the course.
   * Progress is counted per plan unit, so a session that knows its course unit
   * can name its plan unit too — without anyone stitching it by hand.
   */
  private async stitchedPlanUnits(groupId: string): Promise<Map<string, string>> {
    const units = await this.plan.unitsForGroup(groupId);
    const byContentUnit = new Map<string, string>();
    for (const unit of units) {
      if (unit.contentUnitId) byContentUnit.set(unit.contentUnitId, unit.id);
    }
    return byContentUnit;
  }
}

function toPlanSlot(slot: Slot): PlanSlot {
  return {
    id: slot.id,
    weekday: slot.weekday,
    startTime: slot.startTime,
    endTime: slot.endTime,
    room: slot.room,
  };
}

function toNewLesson(
  session: PlannedSession,
  groupId: string,
  schoolId: string,
  teacherId: string | null,
  unitByContentUnit: Map<string, string>,
): NewLesson {
  return {
    groupId,
    schoolId,
    slotId: session.slot.id,
    date: session.date,
    // A checkpoint takes the slot it sits in. The prototype gave exams a fixed
    // 45 minutes, which cannot survive contact with a real two-hour slot.
    startTime: session.slot.startTime,
    endTime: session.slot.endTime,
    teacherId,
    room: session.slot.room,
    status: 'scheduled',
    type: session.type,
    curriculumUnitId: unitByContentUnit.get(session.contentUnitId) ?? null,
    contentUnitId: session.contentUnitId,
    contentLessonId: session.contentLessonId,
    attendance: null,
    note: null,
    extra: false,
    planIndex: session.planIndex,
    passMark: null,
  };
}
