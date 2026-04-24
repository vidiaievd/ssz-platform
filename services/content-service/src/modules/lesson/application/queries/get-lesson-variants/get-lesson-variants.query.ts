import type { LessonVariantsQueryDto } from '../../../presentation/dto/requests/lesson-variants-query.dto.js';

export class GetLessonVariantsQuery {
  constructor(
    public readonly lessonId: string,
    public readonly dto: LessonVariantsQueryDto,
  ) {}
}
