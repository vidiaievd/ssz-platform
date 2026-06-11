import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ResendSchoolInvitationCommand } from './resend-invitation.command.js';
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
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import { InvitationAlreadyAcceptedException } from '../../../domain/exceptions/invitation-already-accepted.exception.js';
import { InvitationRevokedException } from '../../../domain/exceptions/invitation-revoked.exception.js';
import { InvitationResendThrottledException } from '../../../domain/exceptions/invitation-resend-throttled.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { SchoolInvitationSentEvent } from '../../../domain/events/school-invitation-sent.event.js';
import { InvitationTokenService } from '../../../infrastructure/invitation-token.service.js';
import type { Env } from '../../../../../config/configuration.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_THROTTLE_MS = 5 * 60 * 1000;

@CommandHandler(ResendSchoolInvitationCommand)
export class ResendSchoolInvitationHandler implements ICommandHandler<ResendSchoolInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: InvitationTokenService,
    private readonly config: ConfigService<Env>,
  ) {}

  async execute(command: ResendSchoolInvitationCommand): Promise<{
    invitationId: string;
    expiresAt: string;
    deliveryStatus: 'queued';
    resendCount: number;
  }> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;
    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can resend invitations');
    }

    const invitation = await this.invitationRepository.findById(command.invitationId);
    if (!invitation || invitation.schoolId !== command.schoolId) {
      throw new InvitationNotFoundException(command.invitationId);
    }

    if (invitation.isAccepted()) {
      throw new InvitationAlreadyAcceptedException(invitation.id);
    }
    if (invitation.isRevoked()) {
      throw new InvitationRevokedException(invitation.id);
    }

    const msSinceLastSent = Date.now() - invitation.lastSentAt.getTime();
    if (msSinceLastSent < RESEND_THROTTLE_MS) {
      const minutesRemaining = Math.ceil((RESEND_THROTTLE_MS - msSinceLastSent) / 60_000);
      throw new InvitationResendThrottledException(minutesRemaining);
    }

    const newExpiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const newToken = this.tokenService.sign(
      invitation.id,
      invitation.schoolId,
      invitation.role,
      invitation.email,
      newExpiresAt,
      invitation.kind,
      invitation.targetGroupId,
    );

    invitation.rotateToken(newToken, newExpiresAt);
    await this.invitationRepository.save(invitation);

    const appBaseUrl = this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    const invitationUrl = `${appBaseUrl}/invitations/${newToken}/accept`;

    await this.eventPublisher.publish(
      new SchoolInvitationSentEvent(
        randomUUID(),
        invitation.id,
        invitation.schoolId,
        school.name,
        invitation.email,
        'School Admin',
        invitationUrl,
        invitation.role,
        newExpiresAt.toISOString(),
      ),
    );

    return {
      invitationId: invitation.id,
      expiresAt: newExpiresAt.toISOString(),
      deliveryStatus: 'queued',
      resendCount: invitation.resendCount,
    };
  }
}
