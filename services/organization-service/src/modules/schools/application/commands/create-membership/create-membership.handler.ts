import { Inject, Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { SCHOOL_ONBOARDING_SETTINGS_REPOSITORY, type ISchoolOnboardingSettingsRepository } from '../../../domain/repositories/school-onboarding-settings.repository.interface.js';
import { SchoolOnboardingSettings } from '../../../domain/entities/school-onboarding-settings.entity.js';
import { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { AddMemberCommand } from '../add-member/add-member.command.js';
import { CreateMembershipCommand } from './create-membership.command.js';
import { EnrollmentRequestEvent } from '../../../domain/events/enrollment-request.event.js';
import { SeatsExhaustedException } from '../../../domain/exceptions/seats-exhausted.exception.js';
import type { School } from '../../../domain/entities/school.entity.js';
import {
  EVENT_PUBLISHER,
  type IEventPublisher,
} from '../../../../../shared/application/ports/event-publisher.interface.js';
import {
  PROFILE_SERVICE_PORT,
  type IProfileServicePort,
} from '../../../../../shared/application/ports/profile-service.interface.js';

@CommandHandler(CreateMembershipCommand)
export class CreateMembershipHandler implements ICommandHandler<CreateMembershipCommand, SchoolMembership> {
  private readonly logger = new Logger(CreateMembershipHandler.name);

  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
    @Inject(SCHOOL_ONBOARDING_SETTINGS_REPOSITORY) private readonly settingsRepo: ISchoolOnboardingSettingsRepository,
    @Inject(EVENT_PUBLISHER) private readonly eventPublisher: IEventPublisher,
    @Inject(PROFILE_SERVICE_PORT) private readonly profileService: IProfileServicePort,
    private readonly commandBus: CommandBus,
  ) {}

  async execute(command: CreateMembershipCommand): Promise<SchoolMembership> {
    const school = await this.schoolRepo.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const settings = (await this.settingsRepo.findBySchoolId(command.schoolId))
      ?? SchoolOnboardingSettings.defaults(command.schoolId);

    const membership = SchoolMembership.create({
      id: randomUUID(),
      schoolId: command.schoolId,
      studentId: command.studentId,
      source: command.source,
      language: command.language,
      selfReportedLevel: command.selfReportedLevel,
    });

    if (settings.approvalMode === 'auto') {
      const blocked = await this.autoApprove(school, membership, command.studentId);
      if (!blocked) return membership;
      // No seat (plan 90, phase 4): the application joins the manual queue marked `no_seats`
      // and the school hears about it like about any other application — the learner is not
      // refused.
      membership.markBlocked('no_seats');
    }

    await this.membershipRepo.save(membership);

    const adminIds = [
      school.ownerId,
      ...school.members
        .filter((m) => m.role === MemberRole.ADMIN || m.role === MemberRole.MANAGER)
        .map((m) => m.userId),
    ];

    const profileSummary = await this.profileService.getProfileSummary(command.studentId);

    await this.eventPublisher.publish(
      new EnrollmentRequestEvent(
        randomUUID(),
        membership.id,
        school.id,
        school.name,
        command.studentId,
        [...new Set(adminIds)],
        profileSummary?.name ?? command.studentId,
        command.source,
        profileSummary?.avatarUrl ?? undefined,
        profileSummary?.email ?? undefined,
        membership.language,
        membership.ageBand,
      ),
    );

    return membership;
  }

  /**
   * Puts an auto-approved learner on the roster and moves the application on. The pending
   * application is stored first: AddMember finds it and leaves its pipeline alone. True = no
   * seat was left; the application stays pending for the caller to mark.
   *
   * Any other failure to add keeps the old behaviour — logged, and the application still moves
   * to onboarding.
   */
  private async autoApprove(
    school: School,
    membership: SchoolMembership,
    studentId: string,
  ): Promise<boolean> {
    await this.membershipRepo.save(membership);

    // Use the school owner as actor since no admin is present in this flow.
    if (!school.getMemberRole(studentId)) {
      try {
        await this.commandBus.execute(
          new AddMemberCommand(school.ownerId, school.id, studentId, MemberRole.STUDENT),
        );
      } catch (e) {
        if (e instanceof SeatsExhaustedException) {
          this.logger.log(`Auto-approve of ${studentId} into ${school.id} held back: no student seat left`);
          return true;
        }
        this.logger.warn(
          `Could not add student ${studentId} as school member during auto-approve: ${(e as Error).message}`,
        );
      }
    }

    membership.transitionTo('onboarding');
    await this.membershipRepo.save(membership);
    return false;
  }
}
