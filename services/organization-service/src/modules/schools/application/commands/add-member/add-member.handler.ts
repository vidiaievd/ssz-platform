import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AddMemberCommand } from './add-member.command.js';
import {
  SCHOOL_REPOSITORY,
  type ISchoolRepository,
} from '../../../domain/repositories/school.repository.interface.js';
import {
  SCHOOL_MEMBERSHIP_REPOSITORY,
  type ISchoolMembershipRepository,
} from '../../../domain/repositories/school-membership.repository.interface.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SchoolMember } from '../../../domain/entities/school-member.entity.js';
import { SchoolMembership, type MembershipStatus } from '../../../domain/entities/school-membership.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { UserPlatformRoleAssignedEvent } from '../../../domain/events/user-platform-role-assigned.event.js';

const ROLES_REQUIRING_TUTOR: ReadonlySet<MemberRole> = new Set([MemberRole.TEACHER]);

// A membership in one of these states no longer represents an active enrolment,
// so a fresh one must be created when the student is (re-)added to the roster.
const TERMINAL_MEMBERSHIP_STATUSES: ReadonlySet<MembershipStatus> = new Set<MembershipStatus>([
  'rejected',
  'left',
]);

@CommandHandler(AddMemberCommand)
export class AddMemberHandler implements ICommandHandler<AddMemberCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepository: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepository: ISchoolMembershipRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
  ) {}

  async execute(command: AddMemberCommand): Promise<void> {
    const school = await this.schoolRepository.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const actorRole = school.getMemberRole(command.actorId);
    const isOwner = command.actorId === school.ownerId;
    const isAdmin = actorRole === MemberRole.ADMIN;

    // Only owner can directly assign admin role
    if (command.role === MemberRole.ADMIN && !isOwner) {
      throw new ForbiddenOperationException('Only the school owner can assign administrators');
    }

    if (!isOwner && !isAdmin) {
      throw new ForbiddenOperationException('Only owner or admin can add members');
    }

    // Snapshot the display name/avatar once at creation time — kept in sync
    // afterwards via profile.updated events (see ProfileUpdatedConsumer).
    const profileSummary = await this.profileService.getProfileSummary(command.userId);

    const member = SchoolMember.create({
      id: randomUUID(),
      schoolId: command.schoolId,
      userId: command.userId,
      role: command.role,
      joinedAt: new Date(),
      name: profileSummary?.name ?? null,
      avatarUrl: profileSummary?.avatarUrl ?? null,
    });

    school.addMember(member, command.actorId, randomUUID());

    await this.schoolRepository.save(school);

    // Keep the enrolment-lifecycle table (school_memberships) in sync with the
    // roster (school_members). A student can reach the roster either through the
    // enrolment flow (which already created a SchoolMembership) or by being added
    // directly by an owner/admin (which historically created none — leaving
    // GET /schools/:id/memberships/me returning 404 for a real member). Ensure a
    // membership exists here so the roster is the single source of "is a member".
    if (command.role === MemberRole.STUDENT) {
      await this.ensureStudentMembership(command.schoolId, command.userId);
    }

    for (const event of school.getDomainEvents()) {
      await this.eventPublisher.publish(event);
    }
    school.clearDomainEvents();

    if (ROLES_REQUIRING_TUTOR.has(command.role)) {
      await this.eventPublisher.publish(
        new UserPlatformRoleAssignedEvent(randomUUID(), command.userId, 'Tutor'),
      );
    }
  }

  /**
   * Guarantees a non-terminal SchoolMembership for a student roster member,
   * creating an `active`, `direct`-source one only when none exists yet.
   * Idempotent: when invoked from the enrolment flows (CreateMembership
   * auto-approve / ApproveMembership), the membership is already present and
   * non-terminal, so this is a no-op and its onboarding state is preserved.
   * When re-adding a student whose previous membership was rejected/left, a
   * fresh active one is created.
   */
  private async ensureStudentMembership(schoolId: string, studentId: string): Promise<void> {
    const existing = await this.membershipRepository.findBySchoolAndStudent(schoolId, studentId);
    if (existing && !TERMINAL_MEMBERSHIP_STATUSES.has(existing.status)) {
      return;
    }

    // A direct roster add is an admin action, not a self-service application —
    // the student is enrolled immediately rather than dropped into the funnel.
    const membership = SchoolMembership.createDirect({
      id: randomUUID(),
      schoolId,
      studentId,
      source: 'direct',
    });
    await this.membershipRepository.save(membership);
  }
}
