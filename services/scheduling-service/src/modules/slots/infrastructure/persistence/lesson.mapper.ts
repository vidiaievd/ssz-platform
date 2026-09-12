import type {
  Lesson as PrismaLesson,
  LessonScore as PrismaLessonScore,
} from '../../../../../generated/prisma/client.js';
import {
  Lesson,
  type LessonScore,
  type LessonStatus,
  type LessonType,
} from '../../domain/entities/lesson.entity.js';

/** A lesson row, with its score rows when the caller asked for them. */
type LessonRow = PrismaLesson & { scores?: PrismaLessonScore[] };

export class LessonMapper {
  static toDomain(row: LessonRow): Lesson {
    return new Lesson(
      row.id,
      row.groupId,
      row.schoolId,
      row.slotId,
      row.date,
      row.startTime,
      row.endTime,
      row.teacherId,
      row.room,
      row.status as LessonStatus,
      row.type as LessonType,
      row.curriculumUnitId,
      row.contentUnitId,
      row.contentLessonId,
      row.attendance,
      row.note,
      row.extra,
      row.planIndex,
      row.passMark,
      (row.scores ?? []).map(toScore),
    );
  }
}

function toScore(row: PrismaLessonScore): LessonScore {
  return { studentId: row.studentId, score: row.score };
}
