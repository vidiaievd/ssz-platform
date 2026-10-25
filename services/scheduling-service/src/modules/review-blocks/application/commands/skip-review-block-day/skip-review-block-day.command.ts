import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';

export class SkipReviewBlockDayCommand {
  constructor(
    public readonly blockId: string,
    public readonly date: Date,
    public readonly user: AuthenticatedUser,
  ) {}
}
