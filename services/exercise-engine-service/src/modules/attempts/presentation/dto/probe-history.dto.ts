import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** One probe of a past sitting, as the attempt recorded it (the kernel's `ProbeRecord`). */
export class ProbeRecordDto {
  @ApiProperty({ example: 3 })
  n!: number;

  @ApiProperty({ example: 'p-kj-sj-1' })
  pairId!: string;

  @ApiProperty({ example: 'w-kjekk' })
  wordId!: string;

  @ApiProperty({ example: 'kjekk', description: 'The spelling played' })
  text!: string;

  @ApiProperty({ example: 'kj-sj' })
  contrastId!: string;

  @ApiPropertyOptional({ nullable: true, example: 'w-sjekk', description: 'The first answer' })
  first!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'w-kjekk', description: 'The answer that closed it' })
  final!: string | null;

  @ApiProperty({ example: 1 })
  tries!: number;

  @ApiProperty({ example: false, description: 'Whether the first answer was right' })
  correct!: boolean;

  @ApiPropertyOptional({ nullable: true, enum: ['studio', 'teacher', 'tts'] })
  provenance!: 'studio' | 'teacher' | 'tts' | null;
}

export class ProbeHistorySittingDto {
  @ApiProperty({ type: [ProbeRecordDto] })
  probes!: ProbeRecordDto[];
}

export class ProbeHistoryResponseDto {
  @ApiProperty({ example: 'nb', description: 'The history spans every minimal_pairs exercise in it' })
  targetLanguage!: string;

  @ApiProperty({ type: [ProbeHistorySittingDto], description: 'Scored sittings, newest first, at most 50' })
  sittings!: ProbeHistorySittingDto[];
}
