import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { AppConfig } from '../../../../../config/configuration.js';
import {
  SWEEP_AGE_BASIS,
  SWEEP_HISTORY_DAYS,
  SWEEP_KINDS,
  SWEEP_RECENT_RUNS,
  SWEEP_SCHEDULES,
  summarizeSweepReport,
} from '../../../domain/sweep-run.js';
import { SWEEP_RUN_REPOSITORY } from '../../../domain/sweep-run.repository.interface.js';
import type { ISweepRunRepository } from '../../../domain/sweep-run.repository.interface.js';
import { GetSweepsOverviewQuery, type SweepsOverview } from './get-sweeps-overview.query.js';

@QueryHandler(GetSweepsOverviewQuery)
export class GetSweepsOverviewHandler implements IQueryHandler<GetSweepsOverviewQuery, SweepsOverview> {
  constructor(
    @Inject(SWEEP_RUN_REPOSITORY) private readonly runs: ISweepRunRepository,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async execute(): Promise<SweepsOverview> {
    const sweep = this.config.get<AppConfig['orphanSweep']>('orphanSweep')!;
    const retentionDays = this.config.get<AppConfig['tts']>('tts')!.narrationRetentionDays;
    const recent = await this.runs.recentByKind(SWEEP_RECENT_RUNS);

    return {
      historyDays: SWEEP_HISTORY_DAYS,
      items: SWEEP_KINDS.map((kind) => ({
        kind,
        schedule: SWEEP_SCHEDULES[kind],
        nightlyMode: sweep.mode,
        minAgeDays: SWEEP_AGE_BASIS[kind] === 'superseded' ? retentionDays : sweep.minAgeDays,
        ageBasis: SWEEP_AGE_BASIS[kind],
        maxPerRun: sweep.maxPerRun,
        recentRuns: recent[kind].map((run) => ({ ...run, summary: summarizeSweepReport(kind, run.report) })),
      })),
    };
  }
}
