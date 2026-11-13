import type { AdminMemberFilter } from '../../domain/admin-school-roster.js';

export class ListAdminSchoolMembersQuery {
  constructor(
    public readonly schoolId: string,
    public readonly filter: AdminMemberFilter,
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
