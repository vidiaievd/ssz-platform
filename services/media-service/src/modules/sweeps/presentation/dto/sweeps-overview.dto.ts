import { ApiProperty } from '@nestjs/swagger';
import { SWEEP_KINDS, SWEEP_MODES, SWEEP_TRIGGERS } from '../../domain/sweep-run.js';

export class SweepRunSummaryDto {
  @ApiProperty({ description: 'Files looked at', example: 120 })
  scanned!: number;

  @ApiProperty({ description: 'Of those, still in use — never touched', example: 100 })
  kept!: number;

  @ApiProperty({
    description:
      'Of those, what the sweep would delete or tried to (orphans; unused replaced narrations; every abandoned upload)',
    example: 20,
  })
  candidates!: number;

  @ApiProperty({ description: 'Deleted; always 0 in a dry run', example: 0 })
  deleted!: number;

  @ApiProperty({
    description: 'The service that owns the references (exercise-engine or content) did not answer; the run stopped',
    example: false,
  })
  aborted!: boolean;

  @ApiProperty({ description: 'Another run of the same kind was going on that node; this one did nothing', example: false })
  skipped!: boolean;
}

export class SweepRunDto {
  @ApiProperty({ example: '9b0b7c0e-7d1e-4a5e-9a3f-2f8c1d6e4b11' })
  id!: string;

  @ApiProperty({ enum: SWEEP_KINDS, example: 'orphan_recordings' })
  kind!: string;

  @ApiProperty({ enum: SWEEP_MODES, example: 'dry-run' })
  mode!: string;

  @ApiProperty({
    enum: SWEEP_TRIGGERS,
    description: '`nightly` — scheduler; `admin` — admin panel; `operator` — internal route by hand',
    example: 'nightly',
  })
  trigger!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Admin who started it; null for nightly and operator runs' })
  actorId!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: "The sweep's own report (shape depends on `kind`); null while running or after an error",
  })
  report!: Record<string, unknown> | null;

  @ApiProperty({ type: SweepRunSummaryDto, nullable: true, description: 'The report in one shape for any kind' })
  summary!: SweepRunSummaryDto | null;

  @ApiProperty({ type: String, nullable: true, description: 'Why the run failed (the sweep threw)' })
  error!: string | null;

  @ApiProperty({ example: '2026-11-14T03:30:00.000Z' })
  startedAt!: Date;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'null — still going, or the process died before it could write the end',
  })
  finishedAt!: Date | null;
}

export class SweepKindOverviewDto {
  @ApiProperty({ enum: SWEEP_KINDS, example: 'orphan_recordings' })
  kind!: string;

  @ApiProperty({ description: 'Nightly schedule, cron, server time', example: '30 3 * * *' })
  schedule!: string;

  @ApiProperty({
    enum: SWEEP_MODES,
    description: 'What a nightly run does — env `MEDIA_ORPHAN_SWEEP_MODE`, shared by all four; not editable here',
    example: 'dry-run',
  })
  nightlyMode!: string;

  @ApiProperty({ description: 'Files younger than this are not looked at, days', example: 30 })
  minAgeDays!: number;

  @ApiProperty({
    enum: ['created', 'superseded'],
    description: 'What the age counts from: upload, or the moment a narration was replaced (its retention period)',
    example: 'created',
  })
  ageBasis!: string;

  @ApiProperty({ description: 'Files looked at per run, at most', example: 2000 })
  maxPerRun!: number;

  @ApiProperty({ type: [SweepRunDto], description: 'Newest first, at most 10' })
  recentRuns!: SweepRunDto[];
}

export class SweepsOverviewDto {
  @ApiProperty({ description: 'Days of run history kept', example: 90 })
  historyDays!: number;

  @ApiProperty({ type: [SweepKindOverviewDto], description: 'One entry per sweep kind, in a fixed order' })
  items!: SweepKindOverviewDto[];
}
