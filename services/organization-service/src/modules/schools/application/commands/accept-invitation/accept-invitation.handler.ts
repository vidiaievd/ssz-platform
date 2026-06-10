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
import { InvitationExpiredException } from '../../../domain/exceptions/invitation-expired.exception.js';
import { InvitationRevokedException } from '../../../domain/exceptions/invitation-revoked.exception.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { UserPlatformRoleAssignedEvent } from '../../../domain/events/user-platform-role-assigned.event.js';
import { InvitationTokenService } from '../../../infrastructure/invitation-token.service.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';

const ROLES_REQUIRING_TUTOR: ReadonlySet<MemberRole> = new Set([MemberRole.TEACHER]);
const ROLES_REQUIRING_STUDENT: ReadonlySet<MemberRole> = new Set([MemberRole.STUDENT]);

@CommandHandler(AcceptInvitationCommand)
export class AcceptInvitationHandler implements ICommandHandler<AcceptInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
    @Inject(SCHOOL_GROUP_REPOSITORY) private readonly groupRepository: ISchoolGroupRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: InvitationTokenService,
  ) {}

  async execute(command: AcceptInvitationCommand): Promise<void> {
    let decoded: ReturnType<InvitationTokenService['verify']>;
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
      throw new InvitationRevokedException(invitation.id);
    }

    if (invitation.isExpired() || !invitation.isPending()) {
      if (!invitation.isAccepted()) {
        invitation.expire();
        await this.invitationRepository.save(invitation);
      }
      throw new InvitationExpiredException(invitation.id);
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

    school.addMember(member, school.ownerId, randomUUID());
    invitation.accept();

    await this.schoolRepository.save(school);
    await this.invitationRepository.save(invitation);

    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    school.clearDomainEvents();

    if (ROLES_REQUIRING_TUTOR.has(invitation.role)) {
      await this.eventPublisher.publish(
        new UserPlatformRoleAssignedEvent(randomUUID(), command.actorId, 'Tutor'),
      );
    }

    if (ROLES_REQUIRING_STUDENT.has(invitation.role)) {
      await this.eventPublisher.publish(
        new UserPlatformRoleAssignedEvent(randomUUID(), command.actorId, 'Student'),
      );
    }

    if (invitation.targetGroupId) {
      const group = await this.groupRepository.findById(invitation.targetGroupId);
      if (group && !group.isDeleted && group.schoolId === school.id) {
        await this.groupRepository.saveWithMember(group, command.actorId, randomUUID());
      }
    }
  }
}
