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
import { SchoolTeacherAcceptedEvent } from '../../../domain/events/school-teacher-accepted.event.js';
import { InvitationTokenService } from '../../../infrastructure/invitation-token.service.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import {
  SCHOOL_GROUP_REPOSITORY,
  type ISchoolGroupRepository,
} from '../../../domain/repositories/school-group.repository.interface.js';

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
    private readonly prisma: PrismaService,
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

    if (invitation.role === MemberRole.TEACHER) {
      await this.eventPublisher.publish(
        new UserPlatformRoleAssignedEvent(randomUUID(), command.actorId, 'Teacher'),
      );
      await this.eventPublisher.publish(
        new SchoolTeacherAcceptedEvent(
          randomUUID(),
          command.actorId,
          school.id,
          invitation.teacherLanguages ?? null,
        ),
      );
    }

    if (ROLES_REQUIRING_STUDENT.has(invitation.role)) {
      await this.eventPublisher.publish(
        new UserPlatformRoleAssignedEvent(randomUUID(), command.actorId, 'Student'),
      );
    }

    // Materialize teacher workload attrs from invitation into school_teacher.
    if (invitation.role === MemberRole.TEACHER &&
        (invitation.teacherMaxWeeklyHours != null || invitation.teacherEmploymentType != null)) {
      const schoolMember = await (this.prisma as any).schoolMember.findUnique({
        where: { schoolId_userId: { schoolId: school.id, userId: command.actorId } },
      });
      if (schoolMember) {
        await (this.prisma as any).schoolTeacher.upsert({
          where: { schoolId_userId: { schoolId: school.id, userId: command.actorId } },
          create: {
            schoolId: school.id,
            userId: command.actorId,
            memberId: schoolMember.id,
            maxWeeklyHours: invitation.teacherMaxWeeklyHours ?? null,
            employmentType: invitation.teacherEmploymentType ?? null,
            status: 'active',
          },
          update: {
            ...(invitation.teacherMaxWeeklyHours != null && { maxWeeklyHours: invitation.teacherMaxWeeklyHours }),
            ...(invitation.teacherEmploymentType != null && { employmentType: invitation.teacherEmploymentType }),
          },
        });
      }
    }

    // Materialize capability grants for MANAGER role.
    if (invitation.role === MemberRole.MANAGER && invitation.capabilities.length > 0) {
      const schoolMember = await (this.prisma as any).schoolMember.findUnique({
        where: { schoolId_userId: { schoolId: school.id, userId: command.actorId } },
      });
      if (schoolMember) {
        await (this.prisma as any).schoolMemberPermission.upsert({
          where: { schoolId_userId: { schoolId: school.id, userId: command.actorId } },
          create: {
            schoolId: school.id,
            userId: command.actorId,
            memberId: schoolMember.id,
            capabilities: invitation.capabilities,
            updatedAt: new Date(),
          },
          update: {
            capabilities: invitation.capabilities,
            updatedAt: new Date(),
          },
        });
      }
    }

    if (invitation.targetGroupId) {
      const group = await this.groupRepository.findById(invitation.targetGroupId);
      if (group && !group.isDeleted && group.schoolId === school.id) {
        await this.groupRepository.saveWithMember(group, command.actorId, randomUUID());
      }
    }
  }
}
