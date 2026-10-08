import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProbeClipDto {
  @ApiProperty({ description: 'A signed link to the clip. Dies within the hour; never stored' })
  url!: string;

  @ApiProperty({ description: 'When the link stops working, ISO 8601' })
  expiresAt!: string;

  @ApiProperty({ example: 780 })
  durationMs!: number;

  @ApiProperty({
    enum: ['studio', 'teacher', 'tts'],
    description: 'Who said it — the runner writes «syntetisk stemme» under a tts clip',
  })
  provenance!: string;

  @ApiProperty({ description: 'The dialect of the recording, or empty', example: 'ost' })
  dialect!: string;
}

export class ProbeOptionDto {
  @ApiProperty({ description: 'What /answers is sent as `optionId`', example: 'w1kjar' })
  id!: string;

  @ApiPropertyOptional({ description: 'Only when the author shows spelling «always»', example: 'kjære' })
  text?: string;

  @ApiPropertyOptional({ description: 'Only when the author shows meaning «always»' })
  gloss?: string;

  @ApiPropertyOptional({ description: 'Only beside a spelling, when IPA is on' })
  ipa?: string;
}

export class ProbeStateDto {
  @ApiProperty({ description: 'Answers already given to this probe — 1 on a second chance' })
  tries!: number;

  @ApiProperty({ description: '2 with a second chance, 1 otherwise and always 1 in an assignment' })
  maxTries!: number;

  @ApiProperty({ description: 'Always false: the probe handed out is the first one still open' })
  closed!: boolean;
}

export class ClosedProbeDto {
  @ApiProperty()
  n!: number;

  @ApiProperty({ description: 'Whether the first answer was right — what the pip shows' })
  correct!: boolean;
}

/**
 * One probe of a `minimal_pairs` sitting — plan 72 §3.6. Which option is the clip is not here.
 */
export class HandOutProbeResponseDto {
  @ApiProperty({ description: '1-based place in the sitting', example: 3 })
  n!: number;

  @ApiProperty({ description: 'Probes in this sitting', example: 12 })
  total!: number;

  @ApiProperty({ description: 'What /answers names this probe by', example: 'p3' })
  questionId!: string;

  @ApiProperty({ type: ProbeClipDto })
  clip!: ProbeClipDto;

  @ApiProperty({ type: [ProbeOptionDto], description: 'The buttons, in the order drawn' })
  options!: ProbeOptionDto[];

  @ApiProperty({ type: ProbeStateDto })
  state!: ProbeStateDto;

  @ApiProperty({ type: [ClosedProbeDto], description: 'The probes already closed, for the pips' })
  closedProbes!: ClosedProbeDto[];
}
