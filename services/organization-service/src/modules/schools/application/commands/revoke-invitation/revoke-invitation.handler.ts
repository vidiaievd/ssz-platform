import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { RevokeSchoolInvitationCommand } from './revoke-invitation.command.js';
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
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import { InvitationAlreadyAcceptedException } from '../../../domain/exceptions/invitation-already-accepted.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';

@CommandHandler(RevokeSchoolInvitationCommand)
export class RevokeSchoolInvitationHandler implements ICommandHandler<RevokeSchoolInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
  ) {}

  async execute(command: RevokeSchoolInvitationCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can revoke invitations');
    }

    const invitation = await this.invitationRepository.findById(command.invitationId);
    if (!invitation || invitation.schoolId !== command.schoolId) {
      throw new InvitationNotFoundException(command.invitationId);
    }

    if (invitation.isAccepted()) {
      throw new InvitationAlreadyAcceptedException(invitation.id);
    }

    invitation.revoke();
    await this.invitationRepository.save(invitation);
  }
}
