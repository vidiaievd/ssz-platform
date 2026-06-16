import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { SchoolNotFoundException } from '../../../domain/exceptions/school-not-found.exception.js';
import { ForbiddenOperationException } from '../../../domain/exceptions/forbidden-operation.exception.js';
import { SCHOOL_REPOSITORY, type ISchoolRepository } from '../../../domain/repositories/school.repository.interface.js';
import { SCHOOL_ONBOARDING_SETTINGS_REPOSITORY, type ISchoolOnboardingSettingsRepository } from '../../../domain/repositories/school-onboarding-settings.repository.interface.js';
import { SchoolOnboardingSettings } from '../../../domain/entities/school-onboarding-settings.entity.js';
import { MemberRole } from '../../../domain/value-objects/member-role.vo.js';
import { GetOnboardingSettingsQuery } from './get-onboarding-settings.query.js';

@QueryHandler(GetOnboardingSettingsQuery)
export class GetOnboardingSettingsHandler implements IQueryHandler<GetOnboardingSettingsQuery, SchoolOnboardingSettings> {
  constructor(
    @Inject(SCHOOL_REPOSITORY) private readonly schoolRepo: ISchoolRepository,
    @Inject(SCHOOL_ONBOARDING_SETTINGS_REPOSITORY) private readonly settingsRepo: ISchoolOnboardingSettingsRepository,
  ) {}

  async execute(query: GetOnboardingSettingsQuery): Promise<SchoolOnboardingSettings> {
    const school = await this.schoolRepo.findById(query.schoolId);
    if (!school) throw new SchoolNotFoundException(query.schoolId);

    const role = school.getMemberRole(query.callerId);
    if (query.callerId !== school.ownerId && role !== MemberRole.ADMIN) {
      throw new ForbiddenOperationException('Only OWNER or ADMIN can view onboarding settings');
    }

    return (await this.settingsRepo.findBySchoolId(query.schoolId))
      ?? SchoolOnboardingSettings.defaults(query.schoolId);
  }
}
