import type { MembershipStatus } from '../../../domain/entities/school-membership.entity.js';

export class CompleteMembershipOnboardingCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly membershipId: string,
    readonly to: Extract<MembershipStatus, 'active' | 'placement-review'>,
  ) {}
}
