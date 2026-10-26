import { ApiExtraModels, ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

const PROVIDER_KINDS = ['anthropic', 'openai', 'openai_compatible', 'azure_openai', 'google', 'fake'];
const REGIONS = ['eu', 'us', 'global', 'local'];

export class ListModelsQueryDto {
  @ApiPropertyOptional({ description: 'Only the models of this provider', format: 'uuid' })
  @IsOptional()
  @IsUUID()
  providerId?: string;
}

export class ProviderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'anthropic', description: 'Stable handle used by bindings and logs' })
  code!: string;

  @ApiProperty({ enum: PROVIDER_KINDS, example: 'anthropic', description: 'Adapter that speaks to it' })
  kind!: string;

  @ApiProperty({ example: 'Anthropic' })
  displayName!: string;

  @ApiProperty({ type: String, nullable: true, example: null })
  baseUrl!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null, description: 'Azure only' })
  apiVersion!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'ANTHROPIC_API_KEY',
    description: 'Name of the environment variable holding the key — never the key itself',
  })
  credentialRef!: string | null;

  @ApiProperty({ enum: REGIONS, example: 'us', description: 'Where the provider processes data' })
  region!: string;

  @ApiProperty({ example: false, description: "The admin's switch" })
  enabled!: boolean;

  @ApiProperty({ example: false, description: 'Everything a call needs is present in the environment' })
  configured!: boolean;

  @ApiProperty({ type: [String], example: ['environment variable ANTHROPIC_API_KEY is not set'] })
  missing!: string[];

  @ApiProperty({ example: 2 })
  modelCount!: number;
}

export class ModelPriceResponseDto {
  @ApiProperty({ example: '2026-10-20T00:00:00.000Z' })
  effectiveFrom!: Date;

  @ApiProperty({ example: '2', description: 'Per 1M input tokens, decimal string' })
  inputPerMtok!: string;

  @ApiProperty({ example: '10', description: 'Per 1M output tokens, decimal string' })
  outputPerMtok!: string;

  @ApiProperty({ example: '0.2', description: 'Per 1M cache-read tokens, decimal string' })
  cacheReadPerMtok!: string;

  @ApiProperty({ example: '2.5', description: 'Per 1M cache-write tokens, decimal string' })
  cacheWritePerMtok!: string;

  @ApiProperty({ example: '0', description: 'Per hour of audio in, decimal string — speech models' })
  audioPerHour!: string;

  @ApiProperty({ example: 'USD' })
  currency!: string;
}

export class ModelFeaturesDto {
  @ApiProperty({ enum: ['native', 'json_mode', 'none'], example: 'native' })
  structuredOutput!: string;

  @ApiProperty() tools!: boolean;
  @ApiProperty() streaming!: boolean;
  @ApiProperty() vision!: boolean;
  @ApiProperty() audioIn!: boolean;
  @ApiProperty() batch!: boolean;
  @ApiProperty() promptCache!: boolean;

  @ApiProperty({ example: 1000000 })
  contextWindow!: number;

  @ApiProperty({ example: 128000 })
  maxOutput!: number;
}

export class SpeechFeaturesDto {
  @ApiProperty({ type: [String], example: ['nb'], description: 'Course languages it recognizes' })
  languages!: string[];

  @ApiProperty({ description: 'Start and end of every word' }) wordTimings!: boolean;
  @ApiProperty({ description: 'Scores pronunciation against the reference text' }) pronunciation!: boolean;

  @ApiProperty({ example: 120, description: 'Longest audio one call takes' })
  maxAudioSeconds!: number;
}

@ApiExtraModels(ModelFeaturesDto, SpeechFeaturesDto)
export class ModelResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  providerId!: string;

  @ApiProperty({ example: 'anthropic' })
  providerCode!: string;

  @ApiProperty({ example: 'claude-sonnet-5-5', description: "The provider's own id; for Azure, the deployment" })
  providerModelId!: string;

  @ApiProperty({ example: 'Claude Sonnet 5.5' })
  displayName!: string;

  @ApiProperty({
    enum: ['llm', 'speech'],
    example: 'llm',
    description: '`llm` — text in, priced per token; `speech` — audio in, priced per audio hour',
  })
  modality!: string;

  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(ModelFeaturesDto) }, { $ref: getSchemaPath(SpeechFeaturesDto) }],
    description: '`ModelFeaturesDto` for `llm`, `SpeechFeaturesDto` for `speech`',
  })
  features!: ModelFeaturesDto | SpeechFeaturesDto;

  @ApiProperty({ enum: ['active', 'deprecated', 'disabled'], example: 'active' })
  status!: string;

  @ApiProperty({ type: ModelPriceResponseDto, nullable: true, description: 'Price in effect now; null if none recorded' })
  currentPrice!: ModelPriceResponseDto | null;
}

export class UsageDto {
  @ApiProperty({ example: 41, description: 'Uncached input tokens' })
  input!: number;

  @ApiProperty({ example: 12 })
  output!: number;

  @ApiProperty({ example: 0 })
  cacheRead!: number;

  @ApiProperty({ example: 0 })
  cacheWrite!: number;
}

export class CostDto {
  @ApiProperty({ example: 202, description: 'Micro-units of the currency (1e-6), rounded' })
  micros!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;
}

export class TestModelResponseDto {
  @ApiProperty({ enum: ['ok', 'invalid_response', 'error'], example: 'ok' })
  outcome!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: null,
    enum: ['rate_limited', 'overloaded', 'timeout', 'auth', 'invalid_request', 'filtered', 'unavailable', 'invalid_response', 'unknown'],
  })
  errorCode!: string | null;

  @ApiProperty({ type: String, nullable: true, example: null })
  errorMessage!: string | null;

  @ApiProperty({ type: Boolean, nullable: true, example: null, description: 'Whether the router would try the fallback' })
  retryable!: boolean | null;

  @ApiProperty({
    nullable: true,
    description: 'What the model returned: `{ kind: "structured", data }` on success',
    example: { kind: 'structured', data: { ok: true, echo: 'pong' } },
  })
  output!: unknown;

  @ApiProperty({ type: String, nullable: true, enum: ['end', 'length', 'tool', 'refusal', 'filtered'], example: 'end' })
  stop!: string | null;

  @ApiProperty({ type: UsageDto, nullable: true })
  usage!: UsageDto | null;

  @ApiProperty({ example: 812 })
  latencyMs!: number;

  @ApiProperty({ type: String, nullable: true, example: 'req_011CSHoEeqs5C35K2UUqR7Fy' })
  providerRequestId!: string | null;

  @ApiProperty({
    type: CostDto,
    nullable: true,
    description: 'Zero when the call failed before any answer; null when the model has no price in effect',
  })
  cost!: CostDto | null;

  @ApiProperty({ type: String, nullable: true, example: '0.202000', description: 'cost × AI_CREDITS_PER_USD, six decimals' })
  credits!: string | null;

  @ApiProperty({ format: 'uuid', description: 'The ledger row written for this test' })
  callId!: string;
}
