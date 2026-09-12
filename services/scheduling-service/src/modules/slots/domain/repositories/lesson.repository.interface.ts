import type { Lesson, LessonScore, LessonStatus } from '../entities/lesson.entity.js';

export const LESSON_REPOSITORY = Symbol('ILessonRepository');

/** A lesson about to be created. Scores are written separately, never at creation. */
export type NewLesson = Omit<Lesson, 'id' | 'scores'>;

/**
 * Everything a person can change about a lesson after it exists. Mutable on
 * purpose — a patch is assembled field by field from what the caller sent.
 */
export type LessonPatch = {
  -readonly [K in LessonPatchField]?: Lesson[K];
};

type LessonPatchField = keyof Pick<
  Lesson,
  | 'status'
  | 'type'
  | 'date'
  | 'startTime'
  | 'endTime'
  | 'room'
  | 'teacherId'
  | 'curriculumUnitId'
  | 'contentUnitId'
  | 'contentLessonId'
  | 'attendance'
  | 'note'
  | 'passMark'
>;

export interface ILessonRepository {
  findByGroup(groupId: string, from: Date, to: Date): Promise<Lesson[]>;
  /**
   * Every lesson of a group, scores included. The log reads a whole course at
   * once — a date window would cut the very history it exists to show.
   */
  findAllByGroup(groupId: string): Promise<Lesson[]>;
  findById(id: string): Promise<Lesson | null>;
  createMany(lessons: NewLesson[]): Promise<Lesson[]>;
  create(lesson: NewLesson): Promise<Lesson>;
  deleteFutureScheduled(groupId: string, fromDate: Date): Promise<void>;
  delete(id: string): Promise<void>;
  update(id: string, fields: LessonPatch): Promise<Lesson>;
  /** Replaces the marks of one exam. A null score means "not graded", and is kept as such. */
  replaceScores(lessonId: string, scores: LessonScore[]): Promise<Lesson>;
  countByTeacher(teacherId: string, from: Date, to: Date): Promise<number>;
  findNextForGroup(groupId: string, limit: number): Promise<Lesson[]>;
  findBySchoolAndDateRange(schoolId: string, from: Date, to: Date): Promise<Lesson[]>;
  findByTeacherAndDateRange(teacherId: string, from: Date, to: Date): Promise<Lesson[]>;
  updateStatus(ids: string[], status: LessonStatus): Promise<void>;
}
