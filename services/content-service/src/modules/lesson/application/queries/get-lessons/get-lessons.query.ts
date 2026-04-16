import { LessonFilter } from '../../../domain/repositories/lesson.repository.interface.js';

export class GetLessonsQuery {
  constructor(public readonly filter: LessonFilter) {}
}
