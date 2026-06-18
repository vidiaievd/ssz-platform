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

@CommandHandler(CreateMembershipCommand)
export class CreateMembershipHandler implements ICommandHandler<CreateMembershipCommand, SchoolMembership> {
  private readonly logger = new Logger(CreateMembershipHandler.name);

  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
    @Inject(SCHOOL_ONBOARDING_SETTINGS_REPOSITORY) private readonly settingsRepo: ISchoolOnboardingSettingsRepository,
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
    });

    if (settings.approvalMode === 'auto') {
      membership.transitionTo('onboarding');
      await this.membershipRepo.save(membership);

      // Auto-approved → immediately add to school roster so the student
      // can see this school and be assigned to groups without waiting.
      // Use the school owner as actor since no admin is present in this flow.
      if (!school.getMemberRole(command.studentId)) {
        try {
          await this.commandBus.execute(
            new AddMemberCommand(school.ownerId, command.schoolId, command.studentId, MemberRole.STUDENT),
          );
        } catch (e) {
          this.logger.warn(
            `Could not add student ${command.studentId} as school member during auto-approve: ${(e as Error).message}`,
          );
        }
      }

      return membership;
    }

    await this.membershipRepo.save(membership);
    return membership;
  }
}
