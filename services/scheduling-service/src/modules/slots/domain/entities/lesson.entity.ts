export type LessonStatus = 'scheduled' | 'moved' | 'cancelled' | 'held';

/**
 * What kind of session a lesson is. An exam is a type of lesson rather than an
 * entity of its own: assessment then lives in the same log as teaching, with
 * one model behind both.
 */
export type LessonType = 'lesson' | 'exam' | 'make_up' | 'review';

/** One student's mark on one exam. Null score means not graded yet, not zero. */
export interface LessonScore {
  studentId: string;
  score: number | null;
}

export class Lesson {
  constructor(
    public readonly id: string,
    public readonly groupId: string,
    public readonly schoolId: string,
    public readonly slotId: string | null,
    public readonly date: Date,
    public readonly startTime: string,
    public readonly endTime: string,
    /** Who actually taught it. Null counts towards nobody's workload. */
    public readonly teacherId: string | null,
    public readonly room: string | null,
    public readonly status: LessonStatus,
    public readonly type: LessonType,
    public readonly curriculumUnitId: string | null,
    /** Topic, as a reference into the linked course. Null while unassigned. */
    public readonly contentUnitId: string | null,
    public readonly contentLessonId: string | null,
    /** How many of the group turned up; only meaningful once held, never for an exam. */
    public readonly attendance: number | null,
    /** Why it was cancelled. */
    public readonly note: string | null,
    /** Outside the group's weekly pattern, hence absent from the generated plan. */
    public readonly extra: boolean,
    public readonly planIndex: number | null,
    /** Pass mark for this exam alone; null follows the school's. */
    public readonly passMark: number | null,
    /** Only loaded where results matter — empty elsewhere, not "no results". */
    public readonly scores: LessonScore[] = [],
  ) {}
}
