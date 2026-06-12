import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ResendTutoringInvitationCommand } from './resend-tutoring-invitation.command.js';
import {
  TUTORING_GROUP_REPOSITORY,
  type ITutoringGroupRepository,
} from '../../../domain/repositories/tutoring-group.repository.interface.js';
import {
  TUTORING_INVITATION_REPOSITORY,
  type ITutoringInvitationRepository,
} from '../../../domain/repositories/tutoring-invitation.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import { TutoringInvitationAlreadyAcceptedException } from '../../../domain/exceptions/invitation-already-accepted.exception.js';
import { TutoringInvitationRevokedException } from '../../../domain/exceptions/invitation-revoked.exception.js';
import { TutoringInvitationResendThrottledException } from '../../../domain/exceptions/invitation-resend-throttled.exception.js';
import { TutoringInvitationSentEvent } from '../../../domain/events/tutoring-invitation-sent.event.js';
import { TutoringInvitationTokenService } from '../../../infrastructure/tutoring-invitation-token.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESEND_THROTTLE_MS = 5 * 60 * 1000;

@CommandHandler(ResendTutoringInvitationCommand)
export class ResendTutoringInvitationHandler
  implements ICommandHandler<ResendTutoringInvitationCommand>
{
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
    @Inject(TUTORING_INVITATION_REPOSITORY)
    private readonly invitationRepository: ITutoringInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: TutoringInvitationTokenService,
  ) {}

  async execute(command: ResendTutoringInvitationCommand): Promise<{
    invitationId: string;
    expiresAt: string;
    deliveryStatus: 'queued';
    resendCount: number;
  }> {
    const group = await this.groupRepository.findByTutorId(command.actorId);
    if (!group || group.isDeleted) throw new TutoringGroupNotFoundException(command.actorId);

    if (group.tutorId !== command.actorId) {
      throw new ForbiddenOperationException('Only the tutor can resend invitations');
    }

    const invitation = await this.invitationRepository.findById(command.invitationId);
    if (!invitation || invitation.tutorGroupId !== group.id) {
      throw new InvitationNotFoundException(command.invitationId);
    }

    if (invitation.isAccepted()) {
      throw new TutoringInvitationAlreadyAcceptedException(invitation.id);
    }
    if (invitation.isRevoked()) {
      throw new TutoringInvitationRevokedException(invitation.id);
    }

    const msSinceLastSent = Date.now() - invitation.lastSentAt.getTime();
    if (msSinceLastSent < RESEND_THROTTLE_MS) {
      const minutesRemaining = Math.ceil((RESEND_THROTTLE_MS - msSinceLastSent) / 60_000);
      throw new TutoringInvitationResendThrottledException(minutesRemaining);
    }

    const newExpiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const newToken = this.tokenService.sign(
      invitation.id,
      invitation.tutorGroupId,
      invitation.email,
      newExpiresAt,
    );

    invitation.rotateToken(newToken, newExpiresAt);
    await this.invitationRepository.save(invitation);

    await this.eventPublisher.publish(
      new TutoringInvitationSentEvent(randomUUID(), group.id, invitation.email, newToken),
    );

    return {
      invitationId: invitation.id,
      expiresAt: newExpiresAt.toISOString(),
      deliveryStatus: 'queued',
      resendCount: invitation.resendCount,
    };
  }
}
