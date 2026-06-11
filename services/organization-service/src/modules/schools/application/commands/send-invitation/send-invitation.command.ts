import type { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import type { InvitationKind, EmploymentType } from '../../../domain/entities/school-invitation.entity.js';

export class SendInvitationCommand {
  constructor(
    public readonly actorId: string,
    public readonly schoolId: string,
    public readonly email: string,
    public readonly role: MemberRole,
    public readonly kind: InvitationKind = 'register',
    public readonly targetGroupId?: string | null,
    public readonly teacherMaxWeeklyHours?: number | null,
    public readonly teacherEmploymentType?: EmploymentType | null,
  ) {}
}
