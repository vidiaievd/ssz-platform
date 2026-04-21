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
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import { InvitationNotFoundException } from '../../../domain/exceptions/invitation-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { UserPlatformRoleAssignedEvent } from '../../../domain/events/user-platform-role-assigned.event.js';
import { InvitationTokenService } from '../../../infrastructure/invitation-token.service.js';

// School roles that grant the platform Tutor role
const ROLES_REQUIRING_TUTOR: ReadonlySet<MemberRole> = new Set([MemberRole.TEACHER]);

@CommandHandler(AcceptInvitationCommand)
export class AcceptInvitationHandler implements ICommandHandler<AcceptInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: InvitationTokenService,
  ) {}

  async execute(command: AcceptInvitationCommand): Promise<void> {
    // Verify JWT signature and expiry first — rejects tampered or expired tokens
    let decoded: ReturnType<InvitationTokenService['verify']>;
    try {
      decoded = this.tokenService.verify(command.token);
    } catch {
      throw new ForbiddenOperationException('Invitation token is invalid or has expired');
    }

    // Enforce email binding — invitation is for a specific person
    if (decoded.email.toLowerCase() !== command.actorEmail.toLowerCase()) {
      throw new ForbiddenOperationException('This invitation was sent to a different email address');
    }

    const invitation = await this.invitationRepository.findByToken(command.token);
    if (!invitation) throw new InvitationNotFoundException(command.token);

    if (!invitation.isPending()) {
      throw new ForbiddenOperationException(
        `Invitation is not pending (status: ${invitation.status})`,
      );
    }

    // Guard against clock-skew edge case: JWT may still be valid but DB record expired
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

    // Bypass permission check — the invitation itself represents pre-authorization by owner/admin
    school.addMember(member, school.ownerId, randomUUID());
    invitation.accept();

    await this.schoolRepository.save(school);
    await this.invitationRepository.save(invitation);

    // Publish school member events
    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    school.clearDomainEvents();

    // Assign platform Tutor role when the school role requires it
    if (ROLES_REQUIRING_TUTOR.has(invitation.role)) {
      await this.eventPublisher.publish(
        new UserPlatformRoleAssignedEvent(randomUUID(), command.actorId, 'Tutor'),
      );
    }
  }
}
