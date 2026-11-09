import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { IsAdminReason } from '../../../../common/dto/admin-reason.js';
import { FEATURE_KEYS } from '../../../plans/domain/feature-key.js';
import { BILLING_ACCOUNT_TYPES, type BillingAccountType } from '../../domain/billing-account.js';

const KEY_LIST = FEATURE_KEYS.map((k) => k.key).join(', ');

export class AccountParams {
  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES, description: 'workspace = a school (SOLO included); user = a self-taught learner' })
  @IsIn(BILLING_ACCOUNT_TYPES)
  type!: BillingAccountType;

  // Any UUID version: seeded ids are v5.
  @ApiProperty({ format: 'uuid', description: 'schoolId for workspace, userId for user' })
  @IsUUID()
  externalId!: string;
}

export class GrantParams extends AccountParams {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  grantId!: string;
}

export class AssignPlanDto {
  @ApiProperty({ example: 'tutor_pro', description: "Plan code; must match the account's audience and not be archived" })
  @IsString()
  planCode!: string;

  @ApiPropertyOptional({ enum: ['active', 'trial'], default: 'active' })
  @IsOptional()
  @IsIn(['active', 'trial'])
  status?: 'active' | 'trial';

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    nullable: true,
    example: '2026-12-31T23:59:59Z',
    description: 'Null or omitted = open-ended. Required for a trial; must be in the future',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @Type(() => Date)
  @IsDate()
  periodEnd?: Date | null;

  @IsAdminReason('Signed contract, school plan from November')
  reason!: string;
}

export class IssueGrantDto {
  @ApiProperty({ example: 'ai.review_direct', description: `One of: ${KEY_LIST}` })
  @IsString()
  featureKey!: string;

  @ApiPropertyOptional({
    default: true,
    description: 'false = switch the key off for the term (no credits, no limits); revoking the grant gives it back to the plan',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '50',
    description: "Credits per month added to the plan's for this key; null or omitted = unmetered while the grant runs",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  monthlyCredits?: string | null;

  @ApiPropertyOptional({ example: {}, description: 'Key-specific limits, as on a plan feature' })
  @IsOptional()
  @IsObject()
  limits?: Record<string, number>;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'Omitted = now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date;

  @ApiProperty({ type: String, format: 'date-time', example: '2026-11-20T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  endsAt!: Date;

  @IsAdminReason('Paid pilot, 30 days, discount agreed with the school')
  reason!: string;
}

export class AccountResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES })
  type!: BillingAccountType;

  @ApiProperty({ format: 'uuid' })
  externalId!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class SubscriptionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'tutor_pro' })
  planCode!: string;

  @ApiProperty({ example: 'Tutor Pro' })
  planName!: string;

  @ApiProperty({ example: 1, description: 'The plan version this subscription is on' })
  planVersion!: number;

  @ApiProperty({ enum: ['trial', 'active', 'canceled', 'expired'] })
  status!: string;

  @ApiProperty()
  periodStart!: Date;

  @ApiProperty({ type: Date, nullable: true })
  periodEnd!: Date | null;

  @ApiProperty({ description: 'userId of the admin who assigned it' })
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  endedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  endedBy!: string | null;
}

export class GrantResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ai.review_direct' })
  featureKey!: string;

  @ApiProperty({ description: 'false = the grant switches the key off' })
  enabled!: boolean;

  @ApiProperty({ type: String, nullable: true, example: '50' })
  monthlyCredits!: string | null;

  @ApiProperty({ example: {} })
  limits!: Record<string, number>;

  @ApiProperty()
  startsAt!: Date;

  @ApiProperty()
  endsAt!: Date;

  @ApiProperty({ example: 'Paid pilot' })
  reason!: string;

  @ApiProperty({ enum: ['scheduled', 'active', 'ended', 'revoked'] })
  state!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ type: Date, nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ type: String, nullable: true })
  revokedBy!: string | null;
}

export class AccountOverviewResponseDto {
  @ApiProperty({ type: AccountResponseDto })
  account!: AccountResponseDto;

  @ApiProperty({ type: SubscriptionResponseDto, nullable: true, description: "Null = on the audience's free plan" })
  subscription!: SubscriptionResponseDto | null;

  @ApiProperty({ type: [GrantResponseDto], description: 'Active and scheduled grants, soonest ending first' })
  grants!: GrantResponseDto[];
}

export class AccountHistoryResponseDto {
  @ApiProperty({ type: AccountResponseDto })
  account!: AccountResponseDto;

  @ApiProperty({ type: [SubscriptionResponseDto], description: 'Newest first' })
  subscriptions!: SubscriptionResponseDto[];

  @ApiProperty({ type: [GrantResponseDto], description: 'Newest first' })
  grants!: GrantResponseDto[];
}

export const LOOKUP_MAX_IDS = 200;

export class LookupAccountsDto {
  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES, description: 'workspace = schools (SOLO included); user = self-taught learners' })
  @IsIn(BILLING_ACCOUNT_TYPES)
  type!: BillingAccountType;

  // Any UUID version: seeded ids are v5.
  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 1,
    maxItems: LOOKUP_MAX_IDS,
    description: 'schoolIds for workspace, userIds for user; duplicates are answered once',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LOOKUP_MAX_IDS)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

export class LookupPlanDto {
  @ApiProperty({ example: 'school' })
  code!: string;

  @ApiProperty({ example: 'School' })
  name!: string;

  @ApiProperty({ example: 1 })
  version!: number;
}

export class LookupSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['trial', 'active'] })
  status!: string;

  @ApiProperty()
  periodStart!: Date;

  @ApiProperty({ type: Date, nullable: true, description: 'Null = open-ended' })
  periodEnd!: Date | null;
}

export class AccountLookupItemDto {
  @ApiProperty({ format: 'uuid' })
  externalId!: string;

  @ApiProperty({ description: "False = never seen by this service; it is on its audience's free plan all the same" })
  hasAccount!: boolean;

  @ApiProperty({ enum: ['subscription', 'free_plan'] })
  source!: string;

  @ApiProperty({ type: LookupPlanDto, nullable: true, description: 'Null only when the free plan is not seeded' })
  plan!: LookupPlanDto | null;

  @ApiProperty({ type: LookupSubscriptionDto, nullable: true, description: 'Null = on the free plan without a subscription' })
  subscription!: LookupSubscriptionDto | null;

  @ApiProperty({ example: 1, description: 'Grants counting now' })
  activeGrants!: number;

  @ApiProperty({ example: 0, description: 'Grants that start later' })
  scheduledGrants!: number;
}

export class AccountLookupResponseDto {
  @ApiProperty({ type: [AccountLookupItemDto], description: 'One per distinct id, in the order asked' })
  items!: AccountLookupItemDto[];
}
