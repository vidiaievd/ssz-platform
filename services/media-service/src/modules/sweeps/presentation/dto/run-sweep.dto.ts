import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { SWEEP_KINDS, SWEEP_MODES } from '../../domain/sweep-run.js';
import { SweepRunSummaryDto } from './sweeps-overview.dto.js';

export class RunSweepRequestDto {
  @ApiProperty({
    description: '`true` — only count what would go (level `admin`); `false` — delete (level `super`, reason required)',
    example: true,
  })
  @IsBoolean()
  dryRun!: boolean;

  @ApiPropertyOptional({
    description: 'Why — required to delete, goes on the admin trail; a dry run is not journalled',
    maxLength: 500,
    example: 'Bucket at 92 %, dry run of 14.11 checked',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RunSweepResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The `sweep_runs` row; null when the history could not be written (the sweep still ran)',
  })
  runId!: string | null;

  @ApiProperty({ enum: SWEEP_KINDS, example: 'orphan_recordings' })
  kind!: string;

  @ApiProperty({ enum: SWEEP_MODES, example: 'dry-run' })
  mode!: string;

  @ApiProperty({ type: 'object', additionalProperties: true, description: "The sweep's own report (shape depends on `kind`)" })
  report!: Record<string, unknown>;

  @ApiProperty({ type: SweepRunSummaryDto, description: 'The report in one shape for any kind' })
  summary!: SweepRunSummaryDto;
}
