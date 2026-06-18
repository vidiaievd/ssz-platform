import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { MembershipNotFoundException } from '../../../domain/exceptions/membership-not-found.exception.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import type { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { GetMyMembershipQuery } from './get-my-membership.query.js';

@QueryHandler(GetMyMembershipQuery)
export class GetMyMembershipHandler implements IQueryHandler<GetMyMembershipQuery, SchoolMembership> {
  constructor(
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
  ) {}

  async execute(query: GetMyMembershipQuery): Promise<SchoolMembership> {
    const membership = await this.membershipRepo.findBySchoolAndStudent(query.schoolId, query.studentId);
    if (!membership) {
      throw new MembershipNotFoundException(`${query.schoolId}:${query.studentId}`);
    }
    return membership;
  }
}
