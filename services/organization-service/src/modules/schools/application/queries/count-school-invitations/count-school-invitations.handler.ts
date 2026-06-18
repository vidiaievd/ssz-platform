import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CountSchoolInvitationsQuery } from './count-school-invitations.query.js';
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

@QueryHandler(CountSchoolInvitationsQuery)
export class CountSchoolInvitationsHandler
  implements IQueryHandler<CountSchoolInvitationsQuery>
{
  constructor(
    @Inject(SCHOOL_REPOSITORY)
    private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
  ) {}

  async execute(query: CountSchoolInvitationsQuery): Promise<number> {
    const school = await this.schoolRepository.findById(query.schoolId);
    if (!school || school.isDeleted) {
      throw new SchoolNotFoundException(query.schoolId);
    }

    if (!school.isMember(query.actorId) && school.ownerId !== query.actorId) {
      throw new ForbiddenOperationException('You are not a member of this school');
    }

    return this.invitationRepository.countBySchoolId(query.schoolId, query.filters);
  }
}
