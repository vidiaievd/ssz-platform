import type { AgeBand } from './school-group.entity.js';

export type PlacementMode = 'platform' | 'school' | 'none';
export type ApprovalMode = 'auto' | 'manual';

export interface SchoolOnboardingSettingsProps {
  schoolId: string;
  placementMode: PlacementMode;
  schoolTestId?: string;
  reusePlatform: boolean;
  maxResultAgeDays?: number;
  interviewRequired: boolean;
  autoPlaceByScore: boolean;
  collectAvailability: boolean;
  ageBands: AgeBand[];
  collectAgeBand: boolean;
  approvalMode: ApprovalMode;
}

export class SchoolOnboardingSettings {
  readonly schoolId: string;
  placementMode: PlacementMode;
  schoolTestId: string | undefined;
  reusePlatform: boolean;
  maxResultAgeDays: number | undefined;
  interviewRequired: boolean;
  autoPlaceByScore: boolean;
  collectAvailability: boolean;
  ageBands: AgeBand[];
  collectAgeBand: boolean;
  approvalMode: ApprovalMode;

  constructor(props: SchoolOnboardingSettingsProps) {
    this.schoolId = props.schoolId;
    this.placementMode = props.placementMode;
    this.schoolTestId = props.schoolTestId;
    this.reusePlatform = props.reusePlatform;
    this.maxResultAgeDays = props.maxResultAgeDays;
    this.interviewRequired = props.interviewRequired;
    this.autoPlaceByScore = props.autoPlaceByScore;
    this.collectAvailability = props.collectAvailability;
    this.ageBands = props.ageBands;
    this.collectAgeBand = props.collectAgeBand;
    this.approvalMode = props.approvalMode;
  }

  static defaults(schoolId: string): SchoolOnboardingSettings {
    return new SchoolOnboardingSettings({
      schoolId,
      placementMode: 'platform',
      reusePlatform: true,
      // Interview booking has no real slot source yet (scheduling-service has no
      // interview-slot endpoints) — schools must opt in explicitly.
      interviewRequired: false,
      autoPlaceByScore: false,
      collectAvailability: true,
      ageBands: [],
      collectAgeBand: false,
      approvalMode: 'manual',
    });
  }
}
