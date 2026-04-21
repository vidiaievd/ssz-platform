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
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolInvitation } from '../../../domain/entities/school-invitation.entity.js';
import { SchoolInvitationSentEvent } from '../../../domain/events/school-invitation-sent.event.js';
import { InvitationTokenService } from '../../../infrastructure/invitation-token.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@CommandHandler(SendInvitationCommand)
export class SendInvitationHandler implements ICommandHandler<SendInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: InvitationTokenService,
  ) {}

  async execute(command: SendInvitationCommand): Promise<{ token: string }> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;

    // Only owner can invite admins; owner or admin can invite everyone else
    if (command.role === MemberRole.ADMIN && !isOwner) {
      throw new ForbiddenOperationException('Only the school owner can invite administrators');
    }

    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can send invitations');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const invitationId = randomUUID();

    const token = this.tokenService.sign(
      invitationId,
      command.schoolId,
      command.role,
      command.email,
      expiresAt,
    );

    const invitation = SchoolInvitation.create({
      id: invitationId,
      schoolId: command.schoolId,
      email: command.email,
      role: command.role,
      token,
      status: 'PENDING',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await this.invitationRepository.save(invitation);

    await this.eventPublisher.publish(
      new SchoolInvitationSentEvent(
        randomUUID(),
        command.schoolId,
        command.email,
        command.role,
        token,
      ),
    );

    return { token };
  }
}
