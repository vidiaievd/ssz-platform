import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { MembershipSource } from '../../domain/entities/school-membership.entity.js';
import type { ApprovalMode, PlacementMode } from '../../domain/entities/school-onboarding-settings.entity.js';

// ── E.2 ──────────────────────────────────────────────────────────────────────

export class UpsertOnboardingSettingsRequestDto {
  @ApiProperty({ enum: ['platform', 'school', 'none'], example: 'platform' })
  @IsEnum(['platform', 'school', 'none'])
  placementMode: PlacementMode;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsUUID()
  schoolTestId?: string;

  @ApiProperty({ example: true })
  reusePlatform: boolean;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxResultAgeDays?: number;

  @ApiProperty({ example: true })
  interviewRequired: boolean;

  @ApiProperty({ example: false })
  autoPlaceByScore: boolean;

  @ApiProperty({ example: true })
  collectAvailability: boolean;

  @ApiProperty({ enum: ['auto', 'manual'], example: 'manual' })
  @IsEnum(['auto', 'manual'])
  approvalMode: ApprovalMode;
}

// ── E.3 ──────────────────────────────────────────────────────────────────────

export class CreateMembershipRequestDto {
  @ApiProperty({ enum: ['public-apply', 'invite', 'direct'], example: 'public-apply' })
  @IsEnum(['public-apply', 'invite', 'direct'])
  source: MembershipSource;

  @ApiPropertyOptional({ example: 'uk' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}$/)
  language?: string;
}

export class AvailabilitySlotDto {
  @ApiProperty({ example: 1, description: '1=Monday … 7=Sunday' })
  @IsInt()
  @Min(1)
  @Max(7)
  day: number;

  @ApiProperty({ example: '09:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  from: string;

  @ApiProperty({ example: '11:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/)
  to: string;
}

export class SetAvailabilityRequestDto {
  @ApiProperty({ type: [AvailabilitySlotDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  prefs: AvailabilitySlotDto[];
}

export class AssignGroupRequestDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  groupId: string;
}
