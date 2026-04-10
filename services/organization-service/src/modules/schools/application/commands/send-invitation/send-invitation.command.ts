import type { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

export class SendInvitationCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly email: string,
    public readonly role: MemberRole,
  ) {}
}
