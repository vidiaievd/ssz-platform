import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
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
}

export class IssueGrantDto {
  @ApiProperty({ example: 'ai.review_direct', description: `One of: ${KEY_LIST}` })
  @IsString()
  featureKey!: string;

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

  @ApiProperty({ example: 'Paid pilot, 30 days, discount agreed with the school' })
  @IsString()
  @MaxLength(500)
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
