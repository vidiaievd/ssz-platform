import { ApiProperty } from '@nestjs/swagger';

export class BreakerSettingsDto {
  @ApiProperty({ example: 5, description: 'Retryable failures within `windowMs` that open the breaker (AI_BREAKER_FAILURES)' })
  failures!: number;

  @ApiProperty({ example: 60000, description: 'Window the failures are counted in (AI_BREAKER_WINDOW_MS)' })
  windowMs!: number;

  @ApiProperty({ example: 30000, description: 'How long the count keeps it open (AI_BREAKER_OPEN_MS)' })
  openMs!: number;

  @ApiProperty({ example: 300000, description: "Longest a provider's Retry-After may keep it open" })
  maxRetryAfterMs!: number;
}

export class BreakerProviderDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'anthropic' })
  code!: string;

  @ApiProperty({ example: 'Anthropic' })
  displayName!: string;

  @ApiProperty({ example: true, description: "The admin's switch" })
  enabled!: boolean;
}

export class BreakerBindingRefDto {
  @ApiProperty({ example: 'review_draft' })
  capability!: string;

  @ApiProperty({ enum: ['primary', 'fallback'], example: 'primary' })
  role!: string;

  @ApiProperty({ example: true, description: "The binding's own switch" })
  enabled!: boolean;
}

export class BreakerRowDto {
  @ApiProperty({ format: 'uuid' })
  modelId!: string;

  @ApiProperty({ example: 'claude-sonnet-5-5' })
  providerModelId!: string;

  @ApiProperty({ example: 'Claude Sonnet 5.5' })
  displayName!: string;

  @ApiProperty({ enum: ['llm', 'speech', 'tts'], example: 'llm' })
  modality!: string;

  @ApiProperty({ enum: ['active', 'deprecated', 'disabled'], example: 'active' })
  status!: string;

  @ApiProperty({ type: BreakerProviderDto })
  provider!: BreakerProviderDto;

  @ApiProperty({
    enum: ['open', 'closed', 'unknown'],
    example: 'open',
    description:
      '`open` — the router skips the model and goes to the fallback; `closed` — it is called; `unknown` — the ' +
      'breaker store (Redis) could not be read. While Redis is away the router treats every breaker as closed.',
  })
  state!: string;

  @ApiProperty({ type: Number, nullable: true, example: 21400, description: 'Until the router tries it again; open only' })
  reopensInMs!: number | null;

  @ApiProperty({ type: Date, nullable: true, example: '2026-11-14T18:02:31.000Z', description: 'Same, as a moment; open only' })
  reopensAt!: Date | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    example: 2,
    description: 'Retryable failures counted in the current window with no success between; null when unknown',
  })
  recentFailures!: number | null;

  @ApiProperty({ type: [BreakerBindingRefDto], description: 'Bindings that call this model' })
  bindings!: BreakerBindingRefDto[];
}

export class BreakerBoardDto {
  @ApiProperty({ type: BreakerSettingsDto })
  settings!: BreakerSettingsDto;

  @ApiProperty({ example: true, description: 'False when some breaker could not be read' })
  storeAvailable!: boolean;

  @ApiProperty({ type: [BreakerRowDto], description: 'Every registry model; open breakers first' })
  items!: BreakerRowDto[];
}

export class ResetBreakerResponseDto extends BreakerRowDto {
  @ApiProperty({ example: true, description: 'False when it was closed with no failures counted — nothing done, nothing on the trail' })
  changed!: boolean;
}
