import type { SchoolOnboardingSettings } from '../entities/school-onboarding-settings.entity.js';

export const SCHOOL_ONBOARDING_SETTINGS_REPOSITORY = Symbol('SCHOOL_ONBOARDING_SETTINGS_REPOSITORY');

export interface ISchoolOnboardingSettingsRepository {
  findBySchoolId(schoolId: string): Promise<SchoolOnboardingSettings | null>;
  upsert(settings: SchoolOnboardingSettings): Promise<void>;
}
