import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration.js';
import { SweepOrphanRecordingsService } from '../../assets/application/services/sweep-orphan-recordings.service.js';
import { SweepSupersededNarrationsService } from '../../assets/application/services/sweep-superseded-narrations.service.js';
import { SweepAbandonedUploadsService } from '../../assets/application/services/sweep-abandoned-uploads.service.js';
import { SweepOrphanContentAssetsService } from '../../assets/application/services/sweep-orphan-content-assets.service.js';
import { SWEEP_HISTORY_DAYS, type SweepKind, type SweepRunMode, type SweepTrigger } from '../domain/sweep-run.js';
import { SWEEP_RUN_REPOSITORY } from '../domain/sweep-run.repository.interface.js';
import type { ISweepRunRepository } from '../domain/sweep-run.repository.interface.js';

export interface SweepRunRequest {
  trigger: SweepTrigger;
  /** Omitted — the configured nightly mode (`MEDIA_ORPHAN_SWEEP_MODE`). */
  mode?: SweepRunMode;
  actorId?: string | null;
}

/** The four sweeps' reports, as each returns it. */
export type AnySweepReport = { mode: SweepRunMode } & object;

const DAY_MS = 86_400_000;

/**
 * Every way a sweep starts goes through here — the nightly job, the operator's internal route and
 * (step 4) the admin panel — so each run leaves one row in `sweep_runs`.
 *
 * History is secondary to the sweep: if its row cannot be written the sweep still runs (logged).
 * A sweep that throws gets its error written and the error is rethrown to the caller.
 */
@Injectable()
export class SweepRunner {
  private readonly logger = new Logger(SweepRunner.name);

  constructor(
    private readonly orphanRecordings: SweepOrphanRecordingsService,
    private readonly supersededNarrations: SweepSupersededNarrationsService,
    private readonly abandonedUploads: SweepAbandonedUploadsService,
    private readonly orphanContent: SweepOrphanContentAssetsService,
    @Inject(SWEEP_RUN_REPOSITORY) private readonly runs: ISweepRunRepository,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async run(kind: SweepKind, request: SweepRunRequest, now: () => Date = () => new Date()): Promise<AnySweepReport> {
    const mode = request.mode ?? this.config.get<AppConfig['orphanSweep']>('orphanSweep')!.mode;

    const runId = await this.startRow(kind, mode, request, now());
    let report: AnySweepReport;
    try {
      report = await this.sweep(kind, mode);
    } catch (err) {
      await this.finishRow(runId, null, err instanceof Error ? err.message : String(err), now());
      throw err;
    }
    await this.finishRow(runId, report as Record<string, unknown>, null, now());

    if (request.trigger === 'nightly') await this.pruneHistory(now());
    return report;
  }

  private sweep(kind: SweepKind, mode: SweepRunMode): Promise<AnySweepReport> {
    switch (kind) {
      case 'orphan_recordings':
        return this.orphanRecordings.run({ mode });
      case 'superseded_narrations':
        return this.supersededNarrations.run({ mode });
      case 'abandoned_uploads':
        return this.abandonedUploads.run({ mode });
      case 'orphan_content':
        return this.orphanContent.run({ mode });
    }
  }

  private async startRow(kind: SweepKind, mode: SweepRunMode, request: SweepRunRequest, startedAt: Date): Promise<string | null> {
    try {
      return await this.runs.start({
        kind,
        mode,
        trigger: request.trigger,
        actorId: request.actorId ?? null,
        startedAt,
      });
    } catch (err) {
      this.logger.warn(`could not record the start of a ${kind} sweep: ${this.message(err)}`);
      return null;
    }
  }

  private async finishRow(
    runId: string | null,
    report: Record<string, unknown> | null,
    error: string | null,
    finishedAt: Date,
  ): Promise<void> {
    if (!runId) return;
    try {
      await this.runs.finish(runId, { report, error, finishedAt });
    } catch (err) {
      this.logger.warn(`could not record the end of sweep run ${runId}: ${this.message(err)}`);
    }
  }

  /** Keeps `SWEEP_HISTORY_DAYS` of history; run after each nightly sweep (cheap, indexed). */
  private async pruneHistory(now: Date): Promise<void> {
    try {
      const removed = await this.runs.deleteStartedBefore(new Date(now.getTime() - SWEEP_HISTORY_DAYS * DAY_MS));
      if (removed > 0) this.logger.log(`removed ${removed} sweep run(s) older than ${SWEEP_HISTORY_DAYS} days`);
    } catch (err) {
      this.logger.warn(`could not prune sweep history: ${this.message(err)}`);
    }
  }

  private message(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
