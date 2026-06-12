import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ListPendingInvitationsQuery } from './list-pending-invitations.query.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import {
  TUTORING_INVITATION_REPOSITORY,
  type ITutoringInvitationRepository,
} from '../../../domain/repositories/tutoring-invitation.repository.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';
import type { TutoringInvitation } from '../../../domain/entities/tutoring-invitation.entity.js';

@QueryHandler(ListPendingInvitationsQuery)
export class ListPendingInvitationsHandler
  implements IQueryHandler<ListPendingInvitationsQuery>
{
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY)
    private readonly groupRepository: ITutoringGroupRepository,
    @Inject(TUTORING_INVITATION_REPOSITORY)
    private readonly invitationRepository: ITutoringInvitationRepository,
  ) {}

  async execute(query: ListPendingInvitationsQuery): Promise<TutoringInvitation[]> {
    const group = await this.groupRepository.findByTutorId(query.tutorId);
    if (!group || group.isDeleted) throw new TutoringGroupNotFoundException(query.tutorId);

    return this.invitationRepository.findAllByGroupId(group.id);
  }
}
