import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import { SchoolOnboardingSettings } from '../../domain/entities/school-onboarding-settings.entity.js';
import type { ISchoolOnboardingSettingsRepository } from '../../domain/repositories/school-onboarding-settings.repository.interface.js';

@Injectable()
export class SchoolOnboardingSettingsPrismaRepository implements ISchoolOnboardingSettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySchoolId(schoolId: string): Promise<SchoolOnboardingSettings | null> {
    const row = await (this.prisma as any).schoolOnboardingSettings.findUnique({
      where: { schoolId },
    });
    if (!row) return null;
    return new SchoolOnboardingSettings({
      schoolId: row.schoolId,
      placementMode: row.placementMode,
      schoolTestId: row.schoolTestId ?? undefined,
      reusePlatform: row.reusePlatform,
      maxResultAgeDays: row.maxResultAgeDays ?? undefined,
      interviewRequired: row.interviewRequired,
      autoPlaceByScore: row.autoPlaceByScore,
      collectAvailability: row.collectAvailability,
      ageBands: row.ageBands ?? [],
      collectAgeBand: row.collectAgeBand,
      approvalMode: row.approvalMode,
    });
  }

  async upsert(settings: SchoolOnboardingSettings): Promise<void> {
    const data = {
      placementMode: settings.placementMode,
      schoolTestId: settings.schoolTestId ?? null,
      reusePlatform: settings.reusePlatform,
      maxResultAgeDays: settings.maxResultAgeDays ?? null,
      interviewRequired: settings.interviewRequired,
      autoPlaceByScore: settings.autoPlaceByScore,
      collectAvailability: settings.collectAvailability,
      ageBands: settings.ageBands,
      collectAgeBand: settings.collectAgeBand,
      approvalMode: settings.approvalMode,
    };
    await (this.prisma as any).schoolOnboardingSettings.upsert({
      where: { schoolId: settings.schoolId },
      create: { schoolId: settings.schoolId, ...data },
      update: data,
    });
  }
}
