import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import type { ExerciseListQueryDto } from '../../../presentation/dto/requests/exercise-list-query.dto.js';

export class GetExercisesQuery {
  constructor(
    public readonly dto: ExerciseListQueryDto,
    public readonly user: AuthenticatedUser,
  ) {}
}
