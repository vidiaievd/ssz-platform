import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';

export class DeleteReviewBlockCommand {
  constructor(
    public readonly blockId: string,
    public readonly user: AuthenticatedUser,
  ) {}
}
