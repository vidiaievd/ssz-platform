import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ADMIN_REASON_MAX } from '../../../../common/dto/admin-reason.js';

export class MigrateSubscribersDto {
  @ApiProperty({ example: 2, description: "The plan's current version; any other is 422 `migration_target_not_current`" })
  @IsInt()
  @Min(1)
  toVersion!: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [1],
    description: 'Source versions, each below toVersion (else 422 `invalid_source_versions`); omitted = every older version',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  fromVersions?: number[];

  @ApiProperty({ example: true, description: 'true = preview only: counts and key differences, nothing changes' })
  @IsBoolean()
  dryRun!: boolean;

  @ApiPropertyOptional({
    example: 'Credits raised in v2; moving everyone, ticket #201',
    maxLength: ADMIN_REASON_MAX,
    description: 'Why — goes to the admin trail; required (not blank) when dryRun is false',
  })
  @ValidateIf((o: MigrateSubscribersDto) => !o.dryRun || o.reason !== undefined)
  @IsString()
  @Matches(/\S/, { message: 'reason must not be blank' })
  @MaxLength(ADMIN_REASON_MAX)
  reason?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: "The batchId of this run's first call, so every trail row of the run shares it; omitted = a new run",
  })
  @IsOptional()
  @IsUUID()
  batchId?: string;
}

export class FeatureTermsDto {
  @ApiProperty()
  enabled!: boolean;

  @ApiProperty({ type: String, nullable: true, example: '300' })
  monthlyCredits!: string | null;

  @ApiProperty({ example: { max: 30 }, description: 'Key-specific limits; `seats.students` carries `max`' })
  limits!: Record<string, number>;
}

export class FeatureChangeDto {
  @ApiProperty({ example: 'ai.review_draft' })
  featureKey!: string;

  @ApiProperty({ enum: ['added', 'removed', 'changed'] })
  change!: 'added' | 'removed' | 'changed';

  @ApiProperty({ type: FeatureTermsDto, nullable: true, description: 'null = not in the source version' })
  before!: FeatureTermsDto | null;

  @ApiProperty({ type: FeatureTermsDto, nullable: true, description: 'null = not in the target version' })
  after!: FeatureTermsDto | null;
}

export class MigrationSourceDto {
  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: 12, description: 'Current subscriptions on this version' })
  subscribers!: number;

  @ApiProperty({ type: [FeatureChangeDto], description: 'Keys whose terms differ, by key; same terms are left out' })
  changes!: FeatureChangeDto[];
}

export class MigrationPreviewDto {
  @ApiProperty({ enum: [true] })
  dryRun!: true;

  @ApiProperty({ example: 'tutor_pro' })
  planCode!: string;

  @ApiProperty({ example: 2 })
  toVersion!: number;

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ type: [MigrationSourceDto], description: 'Source versions with subscribers, oldest first' })
  sources!: MigrationSourceDto[];
}

export class MigrationBatchDto {
  @ApiProperty({ enum: [false] })
  dryRun!: false;

  @ApiProperty({ example: 'tutor_pro' })
  planCode!: string;

  @ApiProperty({ example: 2 })
  toVersion!: number;

  @ApiProperty({ format: 'uuid', description: 'Pass it back on the next call of the same run' })
  batchId!: string;

  @ApiProperty({ example: 200, description: 'Accounts moved by this call (at most 200)' })
  moved!: number;

  @ApiProperty({ example: 0, description: 'Picked but changed meanwhile; tried again by the next call' })
  skipped!: number;

  @ApiProperty({ example: 37, description: 'Still in scope after this call; call again while > 0 (stop if a call moves none)' })
  remaining!: number;
}
