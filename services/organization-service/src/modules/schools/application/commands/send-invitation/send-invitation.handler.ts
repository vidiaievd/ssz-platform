import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SendInvitationCommand } from './send-invitation.command.js';
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
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolInvitation } from '../../../domain/entities/school-invitation.entity.js';

// Invitation is valid for 7 days
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@CommandHandler(SendInvitationCommand)
export class SendInvitationHandler implements ICommandHandler<SendInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
  ) {}

  async execute(command: SendInvitationCommand): Promise<{ token: string }> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    // Only owner or admin can invite
    const actorRole = school.getMemberRole(command.actorId);
    const canInvite =
      command.actorId === school.ownerId ||
      actorRole === MemberRole.ADMIN;

    if (!canInvite) {
      throw new ForbiddenOperationException('Only owner or admin can send invitations');
    }

    const now = new Date();
    const invitation = SchoolInvitation.create({
      id: randomUUID(),
      schoolId: command.schoolId,
      email: command.email,
      role: command.role,
      token: randomUUID(),
      status: 'PENDING',
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      createdAt: now,
      updatedAt: now,
    });

    await this.invitationRepository.save(invitation);

    return { token: invitation.token };
  }
}
