import type { AuthenticatedUser } from '../../../../../infrastructure/auth/jwt-verifier.service.js';

export class ListSchoolReviewBlocksQuery {
  constructor(
    public readonly schoolId: string,
    public readonly from: Date,
    public readonly to: Date,
    /** Narrows the answer to one teacher — the timetable opening one person's week. */
    public readonly teacherId: string | null,
    public readonly user: AuthenticatedUser,
  ) {}
}
