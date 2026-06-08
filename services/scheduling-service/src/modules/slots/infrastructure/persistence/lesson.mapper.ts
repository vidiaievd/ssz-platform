import type { Lesson as PrismaLesson } from '../../../../../generated/prisma/client.js';
import { Lesson, type LessonStatus } from '../../domain/entities/lesson.entity.js';

export class LessonMapper {
  static toDomain(row: PrismaLesson): Lesson {
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
      row.curriculumUnitId,
    );
  }
}
