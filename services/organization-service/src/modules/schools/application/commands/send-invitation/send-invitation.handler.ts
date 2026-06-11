import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { InvitationAlreadyPendingException } from '../../../domain/exceptions/invitation-already-pending.exception.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { Capability } from '../../../domain/value-objects/capability.vo.js';
import { SchoolInvitation } from '../../../domain/entities/school-invitation.entity.js';
import { SchoolInvitationSentEvent } from '../../../domain/events/school-invitation-sent.event.js';
import { InvitationTokenService } from '../../../infrastructure/invitation-token.service.js';
import { CapabilityResolverService } from '../../services/capability-resolver.service.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import type { Env } from '../../../../../config/configuration.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@CommandHandler(SendInvitationCommand)
export class SendInvitationHandler implements ICommandHandler<SendInvitationCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_INVITATION_REPOSITORY)
    private readonly invitationRepository: ISchoolInvitationRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    private readonly tokenService: InvitationTokenService,
    private readonly capabilityResolver: CapabilityResolverService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env>,
  ) {}

  async execute(command: SendInvitationCommand): Promise<{ invitationId: string; token: string; kind: string; expiresAt: string; deliveryStatus: 'queued' }> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const isOwner = command.actorId === school.ownerId;
    const actorRole = school.getMemberRole(command.actorId);
    const isAdmin = actorRole === MemberRole.ADMIN;
    const isManager = actorRole === MemberRole.MANAGER;
    const isTeacher = actorRole === MemberRole.TEACHER;
    const isPrivileged = isOwner || isAdmin;

    await this.authorizeInvitation(command, isOwner, isAdmin, isManager, isTeacher, isPrivileged, school);

    const existing = await this.invitationRepository.findActivePendingByEmailAndRole(
      command.schoolId,
      command.email,
      command.role,
    );
    if (existing) {
      throw new InvitationAlreadyPendingException(command.email);
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
      command.kind,
      command.targetGroupId,
    );

    const invitation = SchoolInvitation.create({
      id: invitationId,
      schoolId: command.schoolId,
      email: command.email,
      role: command.role,
      kind: command.kind,
      targetGroupId: command.targetGroupId,
      invitedBy: command.actorId,
      token,
      status: 'PENDING',
      expiresAt,
      acceptedAt: null,
      lastSentAt: now,
      resendCount: 0,
      teacherMaxWeeklyHours: command.teacherMaxWeeklyHours ?? null,
      teacherEmploymentType: command.teacherEmploymentType ?? null,
      capabilities: command.capabilities ?? [],
      createdAt: now,
      updatedAt: now,
    });

    await this.invitationRepository.save(invitation);

    const appBaseUrl = this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    const invitationUrl = `${appBaseUrl}/invitations/${token}/accept`;

    await this.eventPublisher.publish(
      new SchoolInvitationSentEvent(
        randomUUID(),
        invitationId,
        command.schoolId,
        school.name,
        command.email,
        'School Admin',
        invitationUrl,
        command.role,
        expiresAt.toISOString(),
      ),
    );

    return { invitationId, token, kind: command.kind, expiresAt: expiresAt.toISOString(), deliveryStatus: 'queued' };
  }

  private async authorizeInvitation(
    command: SendInvitationCommand,
    isOwner: boolean,
    isAdmin: boolean,
    isManager: boolean,
    isTeacher: boolean,
    isPrivileged: boolean,
    school: Awaited<ReturnType<ISchoolRepository['findById']>> & object,
  ): Promise<void> {
    switch (command.role) {
      case MemberRole.ADMIN:
        // Only OWNER may grant admin role.
        if (!isOwner) {
          throw new ForbiddenOperationException('Only the school owner can invite administrators');
        }
        break;

      case MemberRole.MANAGER:
      case MemberRole.CONTENT_ADMIN:
      case MemberRole.SCHEDULER:
        // Organisational-level roles: OWNER/ADMIN only.
        if (!isPrivileged) {
          throw new ForbiddenOperationException('Only OWNER or ADMIN can invite staff members');
        }
        break;

      case MemberRole.TEACHER:
        if (!isPrivileged) {
          if (isManager) {
            await this.capabilityResolver.requireCapability(
              command.actorId,
              Capability.INVITATIONS_CREATE_TEACHER,
              command.schoolId,
              school as any,
            );
          } else {
            throw new ForbiddenOperationException('You do not have permission to invite teachers');
          }
        }
        break;

      case MemberRole.STUDENT:
        if (!isPrivileged) {
          if (isManager) {
            await this.capabilityResolver.requireCapability(
              command.actorId,
              Capability.INVITATIONS_CREATE_STUDENT,
              command.schoolId,
              school as any,
            );
          } else if (isTeacher) {
            if (!command.targetGroupId) {
              throw new ForbiddenOperationException('A teacher must specify targetGroupId when inviting a student');
            }
            const groupTeacher = await (this.prisma as any).groupTeacher.findFirst({
              where: { groupId: command.targetGroupId, userId: command.actorId },
            });
            if (!groupTeacher) {
              throw new ForbiddenOperationException('You can only invite students to groups you teach');
            }
          } else {
            throw new ForbiddenOperationException('You do not have permission to invite students');
          }
        }
        break;

      default:
        throw new ForbiddenOperationException('You do not have permission to send this invitation');
    }
  }
}
