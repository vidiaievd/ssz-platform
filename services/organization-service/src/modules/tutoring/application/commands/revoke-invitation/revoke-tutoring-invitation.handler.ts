import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RevokeTutoringInvitationCommand } from './revoke-tutoring-invitation.command.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import {
  TUTORING_INVITATION_REPOSITORY,
  type ITutoringInvitationRepository,
} from '../../../domain/repositories/tutoring-invitation.repository.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import { TutoringInvitationAlreadyAcceptedException } from '../../../domain/exceptions/invitation-already-accepted.exception.js';

@CommandHandler(RevokeTutoringInvitationCommand)
export class RevokeTutoringInvitationHandler
  implements ICommandHandler<RevokeTutoringInvitationCommand>
{
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
    @Inject(TUTORING_INVITATION_REPOSITORY)
    private readonly invitationRepository: ITutoringInvitationRepository,
  ) {}

  async execute(command: RevokeTutoringInvitationCommand): Promise<void> {
    const group = await this.groupRepository.findByTutorId(command.actorId);
    if (!group || group.isDeleted) throw new TutoringGroupNotFoundException(command.actorId);

    if (group.tutorId !== command.actorId) {
      throw new ForbiddenOperationException('Only the tutor can revoke invitations');
    }

    const invitation = await this.invitationRepository.findById(command.invitationId);
    if (!invitation || invitation.tutorGroupId !== group.id) {
      throw new InvitationNotFoundException(command.invitationId);
    }

    if (invitation.isAccepted()) {
      throw new TutoringInvitationAlreadyAcceptedException(invitation.id);
    }

    invitation.revoke();
    await this.invitationRepository.save(invitation);
  }
}
