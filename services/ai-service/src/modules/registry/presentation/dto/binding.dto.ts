import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export class PutBindingDto {
  @ApiProperty({ format: 'uuid', description: 'Model that answers first' })
  @IsUUID()
  primaryModelId!: string;

  @ApiPropertyOptional({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Tried on a retryable error, a switched-off provider or an open breaker; may be another provider',
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  fallbackModelId?: string | null;

  @ApiProperty({ example: 2048, description: "Output cap per call; must fit both models' maxOutput" })
  @IsInt()
  @Min(1)
  maxOutputTokens!: number;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    example: null,
    description: "Null = provider's default; ignored by models that take no sampling parameters",
  })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number | null;

  @ApiProperty({ example: 30000, description: 'Per-attempt timeout; the fallback gets its own' })
  @IsInt()
  @Min(1000)
  @Max(600_000)
  timeoutMs!: number;

  @ApiProperty({ example: 'diagnostic@1', description: 'Prompt version the agent runs under; recorded with every call' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  promptVersion!: string;

  @ApiProperty({ example: true, description: "The agent's global switch: false refuses every call before any model" })
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({
    example: 3,
    description: 'Version this edit was based on; a mismatch is 409. 0 = only create. Omit to overwrite unconditionally',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class BindingResponseDto {
  @ApiProperty({ example: 'diagnostic' })
  capability!: string;

  @ApiProperty({ format: 'uuid' })
  primaryModelId!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  fallbackModelId!: string | null;

  @ApiProperty({ example: 2048 })
  maxOutputTokens!: number;

  @ApiProperty({ type: Number, nullable: true, example: null })
  temperature!: number | null;

  @ApiProperty({ example: 30000 })
  timeoutMs!: number;

  @ApiProperty({ example: 'diagnostic@1' })
  promptVersion!: string;

  @ApiProperty({ example: true })
  enabled!: boolean;

  @ApiProperty({ example: 1, description: 'Bumped on every write; send it back as expectedVersion' })
  version!: number;

  @ApiProperty({ format: 'uuid', description: 'User who made the last write' })
  updatedBy!: string;

  @ApiProperty({ example: '2026-10-21T08:00:00.000Z' })
  updatedAt!: Date;
}

export class CapabilityBindingResponseDto {
  @ApiProperty({ example: 'diagnostic' })
  capability!: string;

  @ApiProperty({ example: 'Echo through the gateway, for checking a binding' })
  description!: string;

  @ApiProperty({ enum: ['llm', 'speech'], example: 'llm', description: 'The modality both models must have' })
  modality!: string;

  @ApiProperty({
    example: { structuredOutput: 'json_mode', tools: true },
    description:
      'Floor both models must meet; absent field = no requirement. Speech capabilities: ' +
      '`languages`, `wordTimings`, `pronunciation`, `minAudioSeconds`',
  })
  requiredFeatures!: Record<string, unknown>;

  @ApiProperty({ type: BindingResponseDto, nullable: true, description: 'Null = unbound, every call refused' })
  binding!: BindingResponseDto | null;
}

export class BindingSettingsDto {
  @ApiProperty({ format: 'uuid' }) primaryModelId!: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) fallbackModelId!: string | null;
  @ApiProperty({ example: 2048 }) maxOutputTokens!: number;
  @ApiProperty({ type: Number, nullable: true }) temperature!: number | null;
  @ApiProperty({ example: 30000 }) timeoutMs!: number;
  @ApiProperty({ example: 'diagnostic@1' }) promptVersion!: string;
  @ApiProperty({ example: true }) enabled!: boolean;
}

export class BindingChangeResponseDto {
  @ApiProperty({ example: 'diagnostic' })
  capability!: string;

  @ApiProperty({ example: 2, description: "The binding's version after this change" })
  version!: number;

  @ApiProperty({ format: 'uuid' })
  changedBy!: string;

  @ApiProperty({ example: '2026-10-21T08:00:00.000Z' })
  changedAt!: Date;

  @ApiProperty({ type: BindingSettingsDto, nullable: true, description: 'Null when this change created the binding' })
  before!: BindingSettingsDto | null;

  @ApiProperty({ type: BindingSettingsDto })
  after!: BindingSettingsDto;
}

export class UnprocessableBindingDto {
  @ApiProperty({ example: 'Binding for "diagnostic" cannot be written' })
  message!: string;

  @ApiProperty({
    type: [String],
    example: ['fallback model "openai/gpt-5.5": provider not configured — environment variable OPENAI_API_KEY is not set'],
  })
  missing!: string[];
}
