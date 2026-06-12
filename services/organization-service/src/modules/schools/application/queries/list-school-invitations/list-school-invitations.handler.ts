import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListSchoolInvitationsQuery } from './list-school-invitations.query.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_INVITATION_REPOSITORY,
  type ISchoolInvitationRepository,
} from '../../../domain/repositories/school-invitation.repository.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import type { SchoolInvitation } from '../../../domain/entities/school-invitation.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

@QueryHandler(ListSchoolInvitationsQuery)
export class ListSchoolInvitationsHandler
  implements IQueryHandler<ListSchoolInvitationsQuery>
{
  constructor(
    @Inject(SCHOOL_REPOSITORY)
    private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
  ) {}

  async execute(query: ListSchoolInvitationsQuery): Promise<SchoolInvitation[]> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school || school.isDeleted) {
      throw new SchoolNotFoundException(query.schoolId);
    }

    if (!school.isMember(query.actorId) && school.ownerId !== query.actorId) {
      throw new ForbiddenOperationException('You are not a member of this school');
    }

    const actorRole = school.getMemberRole(query.actorId);
    const isOwner = query.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;

    // Teachers may only see STUDENT-role invitations — restrict if neither owner nor admin
    const filters = { ...(query.filters ?? {}) };
    if (!isOwner && !isAdmin) {
      filters.role = MemberRole.STUDENT;
    }

    return this.invitationRepository.findBySchoolId(query.schoolId, filters);
  }
}
