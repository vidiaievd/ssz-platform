import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import type { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { ListMembershipsQuery } from './list-memberships.query.js';

export interface ListMembershipsResult {
  items: SchoolMembership[];
  nextCursor: string | null;
}

@QueryHandler(ListMembershipsQuery)
export class ListMembershipsHandler implements IQueryHandler<ListMembershipsQuery, ListMembershipsResult> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
  ) {}

  async execute(query: ListMembershipsQuery): Promise<ListMembershipsResult> {
    const school = await this.schoolRepo.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    const role = school.getMemberRole(query.callerId);
    if (query.callerId !== school.ownerId && role !== MemberRole.ADMIN && role !== MemberRole.MANAGER) {
      throw new ForbiddenOperationException('Only OWNER, ADMIN, or MANAGER can list memberships');
    }

    return this.membershipRepo.list({
      schoolId: query.schoolId,
      status: query.status,
      search: query.search,
      cursor: query.cursor,
    });
  }
}
