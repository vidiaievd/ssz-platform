import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AcceptTutoringInvitationCommand } from './accept-invitation.command.js';
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
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { TutoringInvitationExpiredException } from '../../../domain/exceptions/invitation-expired.exception.js';
import { TutoringInvitationRevokedException } from '../../../domain/exceptions/invitation-revoked.exception.js';
import { TutoringGroupNotFoundException } from '../../../domain/exceptions/tutoring-group-not-found.exception.js';
import { TutoringStudent } from '../../../domain/entities/tutoring-student.entity.js';
import { TutoringInvitationTokenService } from '../../../infrastructure/tutoring-invitation-token.service.js';

@CommandHandler(AcceptTutoringInvitationCommand)
export class AcceptTutoringInvitationHandler implements ICommandHandler<AcceptTutoringInvitationCommand> {
  constructor(
    @Inject(TUTORING_GROUP_REPOSITORY) private readonly groupRepository: ITutoringGroupRepository,
    @Inject(TUTORING_INVITATION_REPOSITORY)
    private readonly invitationRepository: ITutoringInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: TutoringInvitationTokenService,
  ) {}

  async execute(command: AcceptTutoringInvitationCommand): Promise<void> {
    let decoded: ReturnType<TutoringInvitationTokenService['verify']>;
    try {
      decoded = this.tokenService.verify(command.token);
    } catch {
      throw new ForbiddenOperationException('Invitation token is invalid or has expired');
    }

    if (decoded.email.toLowerCase() !== command.actorEmail.toLowerCase()) {
      throw new ForbiddenOperationException('This invitation was sent to a different email address');
    }

    const invitation = await this.invitationRepository.findByToken(command.token);
    if (!invitation) throw new InvitationNotFoundException(command.token);

    if (invitation.isRevoked()) {
      throw new TutoringInvitationRevokedException(invitation.id);
    }

    if (invitation.isExpired() || !invitation.isPending()) {
      if (!invitation.isAccepted()) {
        invitation.expire();
        await this.invitationRepository.save(invitation);
      }
      throw new TutoringInvitationExpiredException(invitation.id);
    }

    const group = await this.groupRepository.findById(invitation.tutorGroupId);
    if (!group) throw new TutoringGroupNotFoundException(invitation.tutorGroupId);

    const student = TutoringStudent.create({
      id: randomUUID(),
      tutorGroupId: group.id,
      userId: command.actorId,
      joinedAt: new Date(),
    });

    group.addStudent(student, randomUUID());
    invitation.accept();

    await this.groupRepository.save(group);
    await this.invitationRepository.save(invitation);

    for (const event of group.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    group.clearDomainEvents();
  }
}
