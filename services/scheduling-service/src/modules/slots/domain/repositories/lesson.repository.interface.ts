import type { Lesson, LessonStatus } from '../entities/lesson.entity.js';

export const LESSON_REPOSITORY = Symbol('ILessonRepository');

export interface ILessonRepository {
  findByGroup(groupId: string, from: Date, to: Date): Promise<Lesson[]>;
  findById(id: string): Promise<Lesson | null>;
  createMany(lessons: Array<Omit<Lesson, 'id'>>): Promise<Lesson[]>;
  deleteFutureScheduled(groupId: string, fromDate: Date): Promise<void>;
  update(id: string, fields: Partial<Pick<Lesson, 'status' | 'room' | 'curriculumUnitId' | 'teacherId'>>): Promise<Lesson>;
  countByTeacher(teacherId: string, from: Date, to: Date): Promise<number>;
  findNextForGroup(groupId: string, limit: number): Promise<Lesson[]>;
  findBySchoolAndDateRange(schoolId: string, from: Date, to: Date): Promise<Lesson[]>;
  findByTeacherAndDateRange(teacherId: string, from: Date, to: Date): Promise<Lesson[]>;
  updateStatus(ids: string[], status: LessonStatus): Promise<void>;
}
