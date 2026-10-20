import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiProperty({ type: ModelFeaturesDto })
  features!: ModelFeaturesDto;

  @ApiProperty({ enum: ['active', 'deprecated', 'disabled'], example: 'active' })
  status!: string;

  @ApiProperty({ type: ModelPriceResponseDto, nullable: true, description: 'Price in effect now; null if none recorded' })
  currentPrice!: ModelPriceResponseDto | null;
}
