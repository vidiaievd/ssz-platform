import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { BILLED_PAYER_TYPES, type BilledPayerType } from '../../../access/domain/payer.js';
import { CostDto, UsageDto } from '../../../registry/presentation/dto/registry.dto.js';

export class DiagnosticPayerDto {
  @ApiProperty({ enum: BILLED_PAYER_TYPES, example: 'workspace' })
  @IsIn(BILLED_PAYER_TYPES)
  type!: BilledPayerType;

  @ApiProperty({ format: 'uuid', description: 'schoolId or userId' })
  @IsUUID()
  id!: string;
}

export class RunDiagnosticDto {
  @ApiPropertyOptional({
    example: 'ping',
    description: 'Text to echo. With fake models, `@fake:<scenario>` here makes every model fail that way',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  text?: string;

  @ApiPropertyOptional({
    type: DiagnosticPayerDto,
    description:
      "Run as this payer: its policy and tariff are applied and the ledger row is its (surface admin_diagnostic). " +
      'Omitted = the platform pays and the gate lets it through',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DiagnosticPayerDto)
  asPayer?: DiagnosticPayerDto;
}

export class AnsweredByDto {
  @ApiProperty({ format: 'uuid' }) modelId!: string;
  @ApiProperty({ example: 'fake' }) providerCode!: string;
  @ApiProperty({ example: 'fake' }) providerModelId!: string;
  @ApiProperty({ enum: ['primary', 'fallback'], example: 'fallback' }) role!: string;
}

export class RouteAttemptDto {
  @ApiProperty({ enum: ['primary', 'fallback'], example: 'primary' })
  role!: string;

  @ApiProperty({ format: 'uuid' })
  modelId!: string;

  @ApiProperty({ enum: ['ok', 'error', 'skipped'], example: 'skipped' })
  outcome!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'provider_disabled',
    description:
      'Skip reason (model_missing, region_not_allowed, model_disabled, provider_disabled, provider_not_configured, ' +
      'no_adapter, breaker_open) or the error code of a failed call',
  })
  reason!: string | null;
}

export class DiagnosticResponseDto {
  @ApiProperty({
    enum: ['ok', 'invalid_response', 'error', 'disabled', 'unavailable', 'refused_policy', 'refused_quota'],
    example: 'ok',
  })
  outcome!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    description: 'Provider error code, refusal (ai_disabled, region_not_allowed, not_entitled) or gate_unavailable',
  })
  errorCode!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  errorMessage!: string | null;

  @ApiProperty({ type: AnsweredByDto, nullable: true, description: 'Null when no model was called' })
  answeredBy!: AnsweredByDto | null;

  @ApiProperty({ example: true })
  fallbackUsed!: boolean;

  @ApiProperty({ type: String, nullable: true, example: 'diagnostic@1' })
  promptVersion!: string | null;

  @ApiProperty({ type: [RouteAttemptDto], description: 'Every model considered, in order' })
  attempts!: RouteAttemptDto[];

  @ApiProperty({ nullable: true, example: { kind: 'structured', data: { echo: 'ping' } } })
  output!: unknown;

  @ApiProperty({ type: UsageDto, nullable: true })
  usage!: UsageDto | null;

  @ApiProperty({ example: 640 })
  latencyMs!: number;

  @ApiProperty({ format: 'uuid', description: 'The ledger row written for this run' })
  callId!: string;

  @ApiProperty({
    type: CostDto,
    nullable: true,
    description: 'Zero when no model answered; null when the answering model has no price in effect',
  })
  cost!: CostDto | null;

  @ApiProperty({ type: String, nullable: true, example: '0.202000', description: 'cost × AI_CREDITS_PER_USD, six decimals' })
  credits!: string | null;
}
