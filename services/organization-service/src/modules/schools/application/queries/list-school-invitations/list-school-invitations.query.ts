import type { InvitationFilters } from '../../../domain/repositories/school-invitation.repository.interface.js';

export class ListSchoolInvitationsQuery {
  constructor(
    readonly actorId: string,
    readonly schoolId: string,
    readonly filters?: InvitationFilters,
  ) {}
}
