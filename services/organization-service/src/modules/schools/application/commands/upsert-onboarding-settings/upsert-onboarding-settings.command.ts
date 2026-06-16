import type { ApprovalMode, PlacementMode } from '../../../domain/entities/school-onboarding-settings.entity.js';

export class UpsertOnboardingSettingsCommand {
  constructor(
    readonly callerId: string,
    readonly schoolId: string,
    readonly placementMode: PlacementMode,
    readonly schoolTestId: string | undefined,
    readonly reusePlatform: boolean,
    readonly maxResultAgeDays: number | undefined,
    readonly interviewRequired: boolean,
    readonly autoPlaceByScore: boolean,
    readonly collectAvailability: boolean,
    readonly approvalMode: ApprovalMode,
  ) {}
}
