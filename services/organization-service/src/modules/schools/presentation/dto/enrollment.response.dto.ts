import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OnboardingSettingsResponseDto {
  @ApiProperty({ enum: ['platform', 'school', 'none'] })
  placementMode: string;

  @ApiPropertyOptional()
  schoolTestId?: string;

  @ApiProperty()
  reusePlatform: boolean;

  @ApiPropertyOptional()
  maxResultAgeDays?: number;

  @ApiProperty()
  interviewRequired: boolean;

  @ApiProperty()
  autoPlaceByScore: boolean;

  @ApiProperty()
  collectAvailability: boolean;

  @ApiProperty({ enum: ['kids', 'teens', 'adults'], isArray: true })
  ageBands: string[];

  @ApiProperty()
  collectAgeBand: boolean;

  @ApiProperty({ enum: ['auto', 'manual'] })
  approvalMode: string;
}

export class AvailabilitySlotResponseDto {
  @ApiProperty()
  day: number;

  @ApiProperty()
  from: string;

  @ApiProperty()
  to: string;
}

export class MembershipResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  schoolId: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty({ enum: ['pending', 'onboarding', 'placement-review', 'active', 'rejected', 'left'] })
  status: string;

  @ApiProperty({ enum: ['public-apply', 'invite', 'direct'] })
  source: string;

  @ApiPropertyOptional()
  language?: string;

  @ApiPropertyOptional({ enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'], description: "Student's own guess at their level; not authoritative" })
  selfReportedLevel?: string;

  @ApiPropertyOptional({ type: [AvailabilitySlotResponseDto] })
  availability?: AvailabilitySlotResponseDto[];

  @ApiPropertyOptional({ enum: ['kids', 'teens', 'adults'] })
  ageBand?: string;

  @ApiPropertyOptional({ description: 'When the student dismissed the one-time group-assigned banner' })
  groupAssignedSeenAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class MembershipListResponseDto {
  @ApiProperty({ type: [MembershipResponseDto] })
  items: MembershipResponseDto[];

  @ApiPropertyOptional({ description: 'Pass as ?cursor= to get the next page' })
  nextCursor: string | null;
}
