import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';
import type { ReviewBlockChanges } from '../../../domain/repositories/review-block.repository.interface.js';

export class UpdateReviewBlockCommand {
  constructor(
    public readonly blockId: string,
    public readonly changes: ReviewBlockChanges,
    public readonly user: AuthenticatedUser,
  ) {}
}
