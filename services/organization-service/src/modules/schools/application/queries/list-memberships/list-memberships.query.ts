import type { MembershipStatus } from '../../../domain/entities/school-membership.entity.js';

export class ListMembershipsQuery {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly status?: MembershipStatus,
    readonly search?: string,
    readonly cursor?: string,
  ) {}
}
