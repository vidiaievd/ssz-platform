import type { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

export class AddMemberCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly userId: string,
    public readonly role: MemberRole,
  ) {}
}
