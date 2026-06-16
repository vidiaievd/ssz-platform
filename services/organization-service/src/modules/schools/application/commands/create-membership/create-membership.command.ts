import type { MembershipSource } from '../../../domain/entities/school-membership.entity.js';

export class CreateMembershipCommand {
  constructor(
    readonly studentId: string,
    readonly schoolId: string,
    readonly source: MembershipSource,
    readonly language: string | undefined,
  ) {}
}
