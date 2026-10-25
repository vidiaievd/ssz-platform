import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import type { ReviewBlockRepeat } from '../../../domain/entities/review-block.entity.js';

export class CreateReviewBlockCommand {
  constructor(
    public readonly schoolId: string,
    public readonly teacherId: string,
    public readonly repeat: ReviewBlockRepeat,
    public readonly startsOn: Date,
    /** Omitted for a one-off — its last day is its first. */
    public readonly endsOn: Date | null,
    public readonly startTime: string,
    public readonly endTime: string,
    public readonly note: string | null,
    public readonly user: AuthenticatedUser,
  ) {}
}
