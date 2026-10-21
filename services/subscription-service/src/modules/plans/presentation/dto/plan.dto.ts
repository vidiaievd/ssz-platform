import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FEATURE_KEYS } from '../../domain/feature-key.js';
import type { PlanAudience, PlanFeature } from '../../domain/plan.js';

const KEY_LIST = FEATURE_KEYS.map((k) => k.key).join(', ');

export class PlanFeatureDto {
  @ApiProperty({ example: 'ai.review_draft', description: `One of: ${KEY_LIST}. Anything else is 422` })
  @IsString()
  featureKey!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '300',
    description: 'Platform credits per month as a decimal string (up to 6 places); null or omitted = unmetered. Only on keys metered in credits',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  monthlyCredits?: string | null;

  @ApiPropertyOptional({
    example: { perLearnerMonthlyCredits: 20 },
    description: 'Key-specific non-negative numbers; each key accepts only its own names',
  })
  @IsOptional()
  @IsObject()
  limits?: Record<string, number>;
}

export function toPlanFeatures(dtos: PlanFeatureDto[]): PlanFeature[] {
  return dtos.map((f) => ({
    featureKey: f.featureKey,
    enabled: f.enabled,
    monthlyCredits: f.monthlyCredits ?? null,
    limits: f.limits ?? {},
  }));
}

export class CreatePlanDto {
  @ApiProperty({ example: 'tutor_pro', description: 'lower_snake_case, unique, never changes' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Tutor Pro' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: ['workspace', 'individual'], description: 'workspace = schools and SOLO tutors; individual = self-taught learners' })
  @IsIn(['workspace', 'individual'])
  audience!: PlanAudience;

  @ApiProperty({ type: [PlanFeatureDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features!: PlanFeatureDto[];
}

export class RenamePlanDto {
  @ApiProperty({ example: 'Tutor Pro (2027)' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class RevisePlanDto {
  @ApiProperty({ type: [PlanFeatureDto], description: 'The complete feature list of the new version' })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PlanFeatureDto)
  features!: PlanFeatureDto[];

  @ApiPropertyOptional({ example: 1, description: 'Version the edit was based on; a mismatch is 409. Omit to revise whatever is current' })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}

export class PlanFeatureResponseDto {
  @ApiProperty({ example: 'ai.review_draft' })
  featureKey!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ type: String, nullable: true, example: '300' })
  monthlyCredits!: string | null;

  @ApiProperty({ example: {} })
  limits!: Record<string, number>;
}

export class PlanVersionResponseDto {
  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ type: [PlanFeatureResponseDto] })
  features!: PlanFeatureResponseDto[];

  @ApiProperty({ example: 'seed', description: 'userId of the admin, or "seed"' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class PlanResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'tutor_pro' })
  code!: string;

  @ApiProperty({ example: 'Tutor Pro' })
  name!: string;

  @ApiProperty({ enum: ['workspace', 'individual'] })
  audience!: PlanAudience;

  @ApiProperty({ enum: ['active', 'archived'] })
  status!: string;

  @ApiProperty({ type: PlanVersionResponseDto, description: 'The version new subscriptions get' })
  current!: PlanVersionResponseDto;
}

export class PlanDetailsResponseDto extends PlanResponseDto {
  @ApiProperty({ type: [PlanVersionResponseDto], description: 'Every version, newest first' })
  versions!: PlanVersionResponseDto[];
}
