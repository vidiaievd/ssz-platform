import { Inject } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_ONBOARDING_SETTINGS_REPOSITORY, type ISchoolOnboardingSettingsRepository } from '../../../domain/repositories/school-onboarding-settings.repository.interface.js';
import { SchoolOnboardingSettings } from '../../../domain/entities/school-onboarding-settings.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { UpsertOnboardingSettingsCommand } from './upsert-onboarding-settings.command.js';

@CommandHandler(UpsertOnboardingSettingsCommand)
export class UpsertOnboardingSettingsHandler implements ICommandHandler<UpsertOnboardingSettingsCommand> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_ONBOARDING_SETTINGS_REPOSITORY) private readonly settingsRepo: ISchoolOnboardingSettingsRepository,
  ) {}

  async execute(command: UpsertOnboardingSettingsCommand): Promise<void> {
    const school = await this.schoolRepo.findById(command.schoolId);
    if (!school) throw new SchoolNotFoundException(command.schoolId);

    const role = school.getMemberRole(command.callerId);
    if (command.callerId !== school.ownerId && role !== MemberRole.ADMIN) {
      throw new ForbiddenOperationException('Only OWNER or ADMIN can update onboarding settings');
    }

    const settings = new SchoolOnboardingSettings({
      schoolId: command.schoolId,
      placementMode: command.placementMode,
      schoolTestId: command.schoolTestId,
      reusePlatform: command.reusePlatform,
      maxResultAgeDays: command.maxResultAgeDays,
      interviewRequired: command.interviewRequired,
      autoPlaceByScore: command.autoPlaceByScore,
      collectAvailability: command.collectAvailability,
      ageBands: command.ageBands,
      collectAgeBand: command.collectAgeBand,
      approvalMode: command.approvalMode,
    });

    await this.settingsRepo.upsert(settings);
  }
}
