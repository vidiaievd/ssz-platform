import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { BILLING_ACCOUNT_TYPES, type BillingAccountType } from '../../../accounts/domain/billing-account.js';

export class EntitlementsQueryDto {
  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES })
  @IsIn(BILLING_ACCOUNT_TYPES)
  type!: BillingAccountType;

  // Any UUID version: seeded ids are v5.
  @ApiProperty({ format: 'uuid', description: 'schoolId for workspace, userId for user' })
  @IsUUID()
  id!: string;
}

export class MyEntitlementsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: "The workspace from `/w/<id>`; omitted = the caller's own (self-taught) entitlements",
  })
  @IsOptional()
  @IsUUID()
  workspaceId?: string;
}

export class FeatureEntitlementDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ type: String, nullable: true, example: '1000', description: 'Credits per credit period; null = unmetered' })
  monthlyCredits!: string | null;

  @ApiProperty({ example: { perLearnerMonthlyCredits: 100 } })
  limits!: Record<string, number>;
}

class EntitlementsAccountDto {
  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES })
  type!: BillingAccountType;

  @ApiProperty({ format: 'uuid' })
  externalId!: string;
}

class EntitlementsPlanDto {
  @ApiProperty({ example: 'tutor_pro' })
  code!: string;

  @ApiProperty({ example: 'Tutor Pro' })
  name!: string;

  @ApiProperty({ example: 1 })
  version!: number;
}

class EntitlementsSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['trial', 'active'] })
  status!: string;

  @ApiProperty()
  periodStart!: Date;

  @ApiProperty({ type: Date, nullable: true })
  periodEnd!: Date | null;
}

export class EntitlementsResponseDto {
  @ApiProperty({ type: EntitlementsAccountDto })
  account!: EntitlementsAccountDto;

  @ApiProperty({ enum: ['subscription', 'free_plan'] })
  source!: string;

  @ApiProperty({ type: EntitlementsPlanDto, nullable: true, description: 'Null only when the free plan is not seeded' })
  plan!: EntitlementsPlanDto | null;

  @ApiProperty({ type: EntitlementsSubscriptionDto, nullable: true, description: 'Null = on the free plan' })
  subscription!: EntitlementsSubscriptionDto | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: { $ref: '#/components/schemas/FeatureEntitlementDto' },
    example: { 'ai.review_draft': { enabled: true, monthlyCredits: '1000', limits: {} } },
    description: 'Plan features with active grants applied; a key absent here is not available',
  })
  features!: Record<string, FeatureEntitlementDto>;

  @ApiProperty({ description: 'Start of the period monthly credits are counted in' })
  periodStart!: Date;

  @ApiProperty({ description: 'End of that period (exclusive)' })
  periodEnd!: Date;

  @ApiProperty({
    description: 'When time alone changes this answer (period rollover, a grant starting or ending, the subscription running out)',
  })
  validUntil!: Date;

  @ApiProperty({ example: 3, description: 'Grows with every change to the account; 0 = no account yet' })
  version!: number;
}
