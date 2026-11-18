import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { BILLING_ACCOUNT_TYPES } from '../../domain/billing-account.js';

export class AdminStatsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 90, default: 7, description: 'Days ahead the ending-soon lists look into' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  withinDays?: number;
}

class PlanVersionCountDto {
  @ApiProperty({ example: 2 })
  version!: number;

  @ApiProperty({ example: 14 })
  count!: number;
}

class PlanStatsDto {
  @ApiProperty({ example: 'school' })
  code!: string;

  @ApiProperty({ example: 'School' })
  name!: string;

  @ApiProperty({ enum: ['workspace', 'individual'] })
  audience!: string;

  @ApiProperty({ enum: ['active', 'archived'] })
  status!: string;

  @ApiProperty({ example: 2, description: 'The version new assignments get' })
  currentVersion!: number;

  @ApiProperty({ example: 17, description: 'Payers on the plan now through a subscription row (trial included)' })
  subscribers!: number;

  @ApiProperty({ example: 3 })
  trial!: number;

  @ApiProperty({
    type: [PlanVersionCountDto],
    description: 'Subscribers per version, newest first; a version below currentVersion = payers not moved yet',
  })
  byVersion!: PlanVersionCountDto[];
}

class PayerStatsDto {
  @ApiProperty({ example: 42, description: 'Payers with an account here; one never seen is on its free plan and not counted' })
  accounts!: number;

  @ApiProperty({ example: 30 })
  withSubscription!: number;

  @ApiProperty({ example: 12, description: "No current subscription — on the audience's free plan by fallback" })
  withoutSubscription!: number;
}

class PayersStatsDto {
  @ApiProperty({ type: PayerStatsDto })
  workspace!: PayerStatsDto;

  @ApiProperty({ type: PayerStatsDto })
  user!: PayerStatsDto;
}

class EndingGrantDto {
  @ApiProperty({ format: 'uuid' })
  grantId!: string;

  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES })
  accountType!: string;

  @ApiProperty({ format: 'uuid', description: 'schoolId or userId' })
  externalId!: string;

  @ApiProperty({ example: 'ai.review_direct' })
  featureKey!: string;

  @ApiProperty({ description: 'false = the grant switches the key off; its end gives the key back to the plan' })
  enabled!: boolean;

  @ApiProperty({ description: 'In the future = the grant has not started yet' })
  startsAt!: Date;

  @ApiProperty()
  endsAt!: Date;
}

class EndingSubscriptionDto {
  @ApiProperty({ format: 'uuid' })
  subscriptionId!: string;

  @ApiProperty({ enum: BILLING_ACCOUNT_TYPES })
  accountType!: string;

  @ApiProperty({ format: 'uuid', description: 'schoolId or userId' })
  externalId!: string;

  @ApiProperty({ example: 'school' })
  planCode!: string;

  @ApiProperty({ example: 'School' })
  planName!: string;

  @ApiProperty({ example: 1 })
  planVersion!: number;

  @ApiProperty({ enum: ['trial', 'active'] })
  status!: string;

  @ApiProperty({ description: "When the payer falls back to the audience's free plan" })
  periodEnd!: Date;
}

class EndingSoonDto {
  @ApiProperty({ type: [EndingGrantDto], description: 'Live grants ending inside the window, soonest first' })
  grants!: EndingGrantDto[];

  @ApiProperty({ type: [EndingSubscriptionDto], description: 'Current subscriptions ending inside the window, soonest first' })
  subscriptions!: EndingSubscriptionDto[];

  @ApiProperty({ description: 'A list had more than 100 rows and was cut to 100' })
  truncated!: boolean;
}

export class AdminStatsResponseDto {
  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty({ example: 7 })
  withinDays!: number;

  @ApiProperty({ description: 'End of the window: generatedAt + withinDays' })
  horizon!: Date;

  @ApiProperty({ type: [PlanStatsDto], description: 'Every plan, archived included, by audience then code' })
  plans!: PlanStatsDto[];

  @ApiProperty({ type: PayersStatsDto })
  payers!: PayersStatsDto;

  @ApiProperty({ type: EndingSoonDto })
  endingSoon!: EndingSoonDto;
}
