import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SpendQueryDto {
  @ApiPropertyOptional({ example: '2026-10-16', description: 'First UTC day, inclusive. Default: 30 days ending at `to`' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-14', description: 'Last UTC day, inclusive. Default: today' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class MoneyDto {
  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: '12.345678', description: 'Decimal string with six places, never a float' })
  amount!: string;
}

export class SpendUsageDto {
  @ApiProperty({ example: 540, description: 'Calls that reached a model (gate refusals are not counted)' })
  calls!: number;

  @ApiProperty({ example: 5, description: 'Calls that ended in `error` or `invalid_response`' })
  failed!: number;

  @ApiProperty({ example: 2, description: 'Calls answered by the binding’s fallback model' })
  fallbackCalls!: number;

  @ApiProperty({ example: 0, description: 'Calls without a cost: the model had no price in effect (not "cost nothing")' })
  unpricedCalls!: number;

  @ApiProperty({ example: 120000 })
  inputTokens!: number;

  @ApiProperty({ example: 18000 })
  outputTokens!: number;

  @ApiProperty({ example: 0 })
  cacheReadTokens!: number;

  @ApiProperty({ example: 0 })
  cacheWriteTokens!: number;

  @ApiProperty({ example: 736840, description: 'Audio given to speech models, in milliseconds' })
  audioMs!: number;

  @ApiProperty({ example: 6202, description: 'Characters spoken by synthesizers' })
  characters!: number;

  @ApiProperty({ type: [MoneyDto], description: 'What the provider bills, per currency; empty when nothing was priced' })
  cost!: MoneyDto[];

  @ApiProperty({ example: '204.700000', description: 'What the calls charged their payers, in platform credits' })
  credits!: string;
}

export class SpendProviderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'azure-speech' })
  code!: string;

  @ApiProperty({ example: 'azure_speech' })
  kind!: string;

  @ApiProperty({ example: 'Azure Speech' })
  displayName!: string;

  @ApiProperty({ example: 'eu' })
  region!: string;
}

export class SpendModelInfoDto {
  @ApiProperty({ example: 'Pronunciation Assessment' })
  displayName!: string;

  @ApiProperty({ example: 'pronunciation-assessment', description: 'Provider’s id; for Azure, the deployment name' })
  providerModelId!: string;

  @ApiProperty({ enum: ['llm', 'speech', 'tts'] })
  modality!: string;

  @ApiProperty({ enum: ['active', 'deprecated', 'disabled'] })
  status!: string;
}

export class SpendBindingDto {
  @ApiProperty({ example: 'practice_voice' })
  capability!: string;

  @ApiProperty({ enum: ['primary', 'fallback'] })
  role!: string;
}

export class CapabilitySpendDto extends SpendUsageDto {
  @ApiProperty({ example: 'practice_voice' })
  capability!: string;
}

export class ModelSpendDto extends SpendUsageDto {
  @ApiProperty({ format: 'uuid' })
  modelId!: string;

  @ApiProperty({ type: SpendProviderDto, nullable: true, description: 'Null when no longer in the registry' })
  provider!: SpendProviderDto | null;

  @ApiProperty({ type: SpendModelInfoDto, nullable: true, description: 'Null when no longer in the registry' })
  model!: SpendModelInfoDto | null;

  @ApiProperty({ type: [SpendBindingDto], description: 'Where the model is bound now; a bound idle model has zeros' })
  boundTo!: SpendBindingDto[];

  @ApiProperty({ type: [CapabilitySpendDto], description: 'Biggest spend first' })
  byCapability!: CapabilitySpendDto[];
}

export class SpendDayModelDto {
  @ApiProperty({ format: 'uuid' })
  modelId!: string;

  @ApiProperty({ example: 12 })
  calls!: number;

  @ApiProperty({ type: [MoneyDto] })
  cost!: MoneyDto[];
}

export class SpendDayDto {
  @ApiProperty({ example: '2026-11-08' })
  day!: string;

  @ApiProperty({ example: 815 })
  calls!: number;

  @ApiProperty({ type: [MoneyDto] })
  cost!: MoneyDto[];

  @ApiProperty({ type: [SpendDayModelDto], description: 'Only models with calls that day' })
  byModel!: SpendDayModelDto[];
}

export class PlatformSpendResponseDto {
  @ApiProperty({ example: '2026-10-16' })
  from!: string;

  @ApiProperty({ example: '2026-11-14' })
  to!: string;

  @ApiProperty({ type: SpendUsageDto })
  totals!: SpendUsageDto;

  @ApiProperty({ type: [ModelSpendDto], description: 'Biggest USD spend first, then other money, then calls' })
  models!: ModelSpendDto[];

  @ApiProperty({ type: [SpendDayDto], description: 'Every day of the period, zeros included' })
  daily!: SpendDayDto[];
}
