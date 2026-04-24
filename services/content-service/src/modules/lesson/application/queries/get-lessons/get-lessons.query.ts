import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import type { LessonListQueryDto } from '../../../presentation/dto/requests/lesson-list-query.dto.js';

export class GetLessonsQuery {
  constructor(
    public readonly dto: LessonListQueryDto,
    public readonly user: AuthenticatedUser,
  ) {}
}
