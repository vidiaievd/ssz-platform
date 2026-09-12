import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { TutoringInvitation } from '../../../domain/entities/tutoring-invitation.entity.js';
import { TutoringInvitationSentEvent } from '../../../domain/events/tutoring-invitation-sent.event.js';
import { TutoringInvitationTokenService } from '../../../infrastructure/tutoring-invitation-token.service.js';
import type { Env } from '../../../../../config/configuration.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@CommandHandler(SendTutoringInvitationCommand)
export class SendTutoringInvitationHandler implements ICommandHandler<SendTutoringInvitationCommand> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
    @Inject(TUTORING_INVITATION_REPOSITORY)
    private readonly invitationRepository: ITutoringInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
    private readonly tokenService: TutoringInvitationTokenService,
    private readonly config: ConfigService<Env>,
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

    const existing = await this.invitationRepository.findActivePendingByEmail(group.id, command.email);
    if (existing) {
      throw new ForbiddenOperationException(`A pending invitation for ${command.email} already exists`);
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
      acceptedAt: null,
      lastSentAt: now,
      resendCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    await this.invitationRepository.save(invitation);

    const appBaseUrl = this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    const invitationUrl = `${appBaseUrl}/invite/${token}`;
    const tutorProfile = await this.profileService.getProfileSummary(group.tutorId);
    const tutorName = tutorProfile?.name ?? 'Your tutor';

    await this.eventPublisher.publish(
      new TutoringInvitationSentEvent(
        randomUUID(),
        invitationId,
        group.id,
        command.email,
        token,
        invitationUrl,
        tutorName,
        expiresAt.toISOString(),
      ),
    );

    return { invitationId, token, expiresAt: expiresAt.toISOString(), deliveryStatus: 'queued' };
  }
}
