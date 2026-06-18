import type { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

export class ListSchoolMembersQuery {
  constructor(
    readonly actorId: string,
    readonly schoolId: string,
    readonly role?: MemberRole,
  ) {}
}
