import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { randomUUID } from 'crypto';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_MEMBERSHIP_REPOSITORY, type ISchoolMembershipRepository } from '../../../domain/repositories/school-membership.repository.interface.js';
import { SCHOOL_ONBOARDING_SETTINGS_REPOSITORY, type ISchoolOnboardingSettingsRepository } from '../../../domain/repositories/school-onboarding-settings.repository.interface.js';
import { SchoolOnboardingSettings } from '../../../domain/entities/school-onboarding-settings.entity.js';
import { SchoolMembership } from '../../../domain/entities/school-membership.entity.js';
import { CreateMembershipCommand } from './create-membership.command.js';

@CommandHandler(CreateMembershipCommand)
export class CreateMembershipHandler implements ICommandHandler<CreateMembershipCommand, SchoolMembership> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_MEMBERSHIP_REPOSITORY) private readonly membershipRepo: ISchoolMembershipRepository,
    @Inject(SCHOOL_ONBOARDING_SETTINGS_REPOSITORY) private readonly settingsRepo: ISchoolOnboardingSettingsRepository,
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

    // auto-approve if approvalMode=auto
    if (settings.approvalMode === 'auto') {
      membership.transitionTo('onboarding');
    }

    await this.membershipRepo.save(membership);
    return membership;
  }
}
