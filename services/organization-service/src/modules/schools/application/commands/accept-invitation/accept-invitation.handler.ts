import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AcceptInvitationCommand } from './accept-invitation.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_INVITATION_REPOSITORY,
  type ISchoolInvitationRepository,
} from '../../../domain/repositories/school-invitation.repository.interface.js';
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';

@CommandHandler(AcceptInvitationCommand)
export class AcceptInvitationHandler implements ICommandHandler<AcceptInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
  ) {}

  async execute(command: AcceptInvitationCommand): Promise<void> {
    const invitation = await this.invitationRepository.findByToken(command.token);
    if (!invitation) throw new InvitationNotFoundException(command.token);

    if (!invitation.isPending()) {
      throw new ForbiddenOperationException(
        `Invitation is not pending (status: ${invitation.status})`,
      );
    }

    if (invitation.isExpired()) {
      invitation.expire();
      await this.invitationRepository.save(invitation);
      throw new ForbiddenOperationException('Invitation has expired');
    }

    const school = await this.schoolRepository.findById(invitation.schoolId);
    if (!school) throw new SchoolNotFoundException(invitation.schoolId);

    const member = SchoolMember.create({
      id: randomUUID(),
      schoolId: school.id,
      userId: command.actorId,
      role: invitation.role,
      joinedAt: new Date(),
    });

    // addMember uses actorId === ownerId check; bypass by using ownerId as actor
    // since this is a valid invitation flow — the owner pre-authorized it
    school.addMember(member, school.ownerId, randomUUID());
    invitation.accept();

    await this.schoolRepository.save(school);
    await this.invitationRepository.save(invitation);
  }
}
