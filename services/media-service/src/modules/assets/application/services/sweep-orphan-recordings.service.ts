import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { MEDIA_ASSET_REPOSITORY } from '../../domain/repositories/media-asset.repository.interface.js';
import type {
  IMediaAssetRepository,
  RecordingSweepCursor,
} from '../../domain/repositories/media-asset.repository.interface.js';
import { RECORDING_USAGE } from '../../../../shared/application/ports/recording-usage.port.js';
import type { IRecordingUsage } from '../../../../shared/application/ports/recording-usage.port.js';
import { AssetPurger } from './asset-purger.js';

export type SweepMode = 'dry-run' | 'delete';

export interface SweepReport {
  mode: SweepMode;
  /** Recordings old enough to be asked about. */
  scanned: number;
  /** Of those, the ones an attempt still stands on — never touched. */
  inUse: number;
  /** The rest: nobody stands on them. */
  orphans: number;
  /** Purged this run; always 0 in a dry run. */
  deleted: number;
  /** The engine could not answer, so the run stopped and nothing further was touched. */
  aborted: boolean;
  /** Another run was still going on this node; this call did nothing. */
  skipped: boolean;
}

const BATCH = 200;
const DAY_MS = 86_400_000;

/**
 * Removes recordings nobody stands on (plan 71). The rules that keep it from ever deleting
 * a student's work are the whole of the design, so they are stated here, once:
 *
 *  1. **Doubt is not deletion.** The engine owns the attempts; if it cannot answer, the run
 *     stops. The sweep never reasons "no answer, so unused".
 *  2. **Young files are not asked about.** Anything newer than the minimum age may still be
 *     uploading or waiting for its hand-in.
 *  3. **Only recordings.** The repository query is the only way candidates arrive.
 *  4. **A dry run is the default** (`MEDIA_ORPHAN_SWEEP_MODE`) and deletes nothing.
 *  5. **A run is bounded** (`MEDIA_ORPHAN_MAX_PER_RUN`): a fault cannot become an avalanche.
 */
@Injectable()
export class SweepOrphanRecordingsService {
  private readonly logger = new Logger(SweepOrphanRecordingsService.name);
  private running = false;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: IMediaAssetRepository,
    @Inject(RECORDING_USAGE) private readonly usage: IRecordingUsage,
    private readonly purger: AssetPurger,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** `mode` overrides the configured one — a manual run asks for a dry run explicitly. */
  async run(options: { mode?: SweepMode; now?: Date } = {}): Promise<SweepReport> {
    const cfg = this.config.get<AppConfig['orphanSweep']>('orphanSweep')!;
    const mode = options.mode ?? cfg.mode;
    const now = options.now ?? new Date();
    // One cut-off for both questions: a file younger than this is not a candidate, and a
    // draft saved since this is still being recorded into.
    const cutOff = new Date(now.getTime() - cfg.minAgeDays * DAY_MS);

    const report: SweepReport = { mode, scanned: 0, inUse: 0, orphans: 0, deleted: 0, aborted: false, skipped: false };

    // A scheduled run and a manual one must not walk the same files at once.
    if (this.running) {
      this.logger.warn('orphan sweep skipped: another run is still going');
      return { ...report, skipped: true };
    }
    this.running = true;
    try {
      return await this.sweep(report, cfg, cutOff);
    } finally {
      this.running = false;
    }
  }

  private async sweep(
    report: SweepReport,
    cfg: AppConfig['orphanSweep'],
    cutOff: Date,
  ): Promise<SweepReport> {
    const mode = report.mode;
    let cursor: RecordingSweepCursor | null = null;

    while (report.scanned < cfg.maxPerRun) {
      const limit = Math.min(BATCH, cfg.maxPerRun - report.scanned);
      const batch = await this.assets.findRecordingsOlderThan(cutOff, cursor, limit);
      if (batch.length === 0) break;

      const asked = await this.usage.inUse(
        batch.map((asset) => asset.id),
        cutOff,
      );
      if (asked.isFail) {
        this.logger.warn(`orphan sweep stopped: the engine could not answer (${asked.error}); nothing deleted from this batch`);
        report.aborted = true;
        break;
      }
      const held = asked.value;

      const orphans = batch.filter((asset) => !held.has(asset.id));
      report.scanned += batch.length;
      report.inUse += batch.length - orphans.length;
      report.orphans += orphans.length;

      for (const asset of orphans) {
        if (mode === 'dry-run') {
          this.logger.log(`[dry-run] would delete recording ${asset.id} (attempt ${asset.entityId ?? '-'}, ${asset.createdAt.toISOString()})`);
          continue;
        }
        try {
          const purged = await this.purger.purge(asset);
          if (purged.isOk) report.deleted += 1;
        } catch (err) {
          // One bad object must not stop the run; it is simply asked about again next time.
          this.logger.warn(`could not delete recording ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const last = batch[batch.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (batch.length < limit) break;
    }

    this.logger.log(
      `orphan sweep (${mode}): scanned ${report.scanned}, in use ${report.inUse}, orphans ${report.orphans}, deleted ${report.deleted}${report.aborted ? ', ABORTED' : ''}`,
    );
    return report;
  }
}
