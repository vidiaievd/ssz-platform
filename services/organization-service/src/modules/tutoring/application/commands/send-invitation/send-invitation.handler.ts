import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SendTutoringInvitationCommand } from './send-invitation.command.js';
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
import { TutoringInvitation } from '../../../domain/entities/tutoring-invitation.entity.js';
import { TutoringInvitationSentEvent } from '../../../domain/events/tutoring-invitation-sent.event.js';
import { TutoringInvitationTokenService } from '../../../infrastructure/tutoring-invitation-token.service.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@CommandHandler(SendTutoringInvitationCommand)
export class SendTutoringInvitationHandler implements ICommandHandler<SendTutoringInvitationCommand> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
    @Inject(TUTORING_INVITATION_REPOSITORY)
    private readonly invitationRepository: ITutoringInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: TutoringInvitationTokenService,
  ) {}

  async execute(command: SendTutoringInvitationCommand): Promise<{
    invitationId: string;
    token: string;
    expiresAt: string;
    deliveryStatus: 'queued';
  }> {
    const group = await this.groupRepository.findByTutorId(command.actorId);
    if (!group || group.isDeleted) throw new TutoringGroupNotFoundException(command.actorId);

    if (command.actorId !== group.tutorId) {
      throw new ForbiddenOperationException('Only the tutor can send invitations');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    const invitationId = randomUUID();

    const token = this.tokenService.sign(invitationId, group.id, command.email, expiresAt);

    const invitation = TutoringInvitation.create({
      id: invitationId,
      tutorGroupId: group.id,
      email: command.email,
      token,
      status: 'PENDING',
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await this.invitationRepository.save(invitation);

    await this.eventPublisher.publish(
      new TutoringInvitationSentEvent(randomUUID(), group.id, command.email, token),
    );

    return { invitationId, token, expiresAt: expiresAt.toISOString(), deliveryStatus: 'queued' };
  }
}
