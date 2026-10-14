import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { MEDIA_ASSET_REPOSITORY } from '../../domain/repositories/media-asset.repository.interface.js';
import type {
  IMediaAssetRepository,
  SupersededSweepCursor,
} from '../../domain/repositories/media-asset.repository.interface.js';
import { LESSON_MEDIA_USAGE } from '../../../../shared/application/ports/lesson-media-usage.port.js';
import type { ILessonMediaUsage } from '../../../../shared/application/ports/lesson-media-usage.port.js';
import { AssetPurger } from './asset-purger.js';
import type { SweepMode } from './sweep-orphan-recordings.service.js';

export interface SupersededSweepReport {
  mode: SweepMode;
  /** Replaced lesson assets past the retention period. */
  scanned: number;
  /** Of those, the ones some lesson body still names — never deleted; the mark is cleared. */
  inUse: number;
  /** The rest: replaced, out of retention, named by nobody. */
  unused: number;
  /** Purged this run; always 0 in a dry run. */
  deleted: number;
  /** content-service could not answer, so the run stopped and nothing further was touched. */
  aborted: boolean;
  /** Another run was still going on this node; this call did nothing. */
  skipped: boolean;
}

const BATCH = 200;
const DAY_MS = 86_400_000;

/**
 * Removes lesson narrations that were replaced and stayed replaced (plan 74, D5). The same
 * rules as the orphan-recording sweep (plan 71), with content-service in the engine's place:
 *
 *  1. **Doubt is not deletion.** If content-service cannot say which assets a lesson body
 *     names, the run stops.
 *  2. **The retention period is the author's undo window** (`NARRATION_RETENTION_DAYS`):
 *     nothing replaced more recently is looked at.
 *  3. **A mark is not a verdict.** An asset a body still names — the author restored it by
 *     hand, or an older published version plays it — is in use; its mark is cleared.
 *  4. **A dry run is the default** (`MEDIA_ORPHAN_SWEEP_MODE`, shared with plan 71).
 *  5. **A run is bounded** (`MEDIA_ORPHAN_MAX_PER_RUN`).
 */
@Injectable()
export class SweepSupersededNarrationsService {
  private readonly logger = new Logger(SweepSupersededNarrationsService.name);
  private running = false;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: IMediaAssetRepository,
    @Inject(LESSON_MEDIA_USAGE) private readonly usage: ILessonMediaUsage,
    private readonly purger: AssetPurger,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  async run(options: { mode?: SweepMode; now?: Date } = {}): Promise<SupersededSweepReport> {
    const sweep = this.config.get<AppConfig['orphanSweep']>('orphanSweep')!;
    const retentionDays = this.config.get<AppConfig['tts']>('tts')!.narrationRetentionDays;
    const mode = options.mode ?? sweep.mode;
    const now = options.now ?? new Date();
    const cutOff = new Date(now.getTime() - retentionDays * DAY_MS);

    const report: SupersededSweepReport = {
      mode,
      scanned: 0,
      inUse: 0,
      unused: 0,
      deleted: 0,
      aborted: false,
      skipped: false,
    };

    if (this.running) {
      this.logger.warn('superseded narration sweep skipped: another run is still going');
      return { ...report, skipped: true };
    }
    this.running = true;
    try {
      return await this.sweep(report, sweep.maxPerRun, cutOff);
    } finally {
      this.running = false;
    }
  }

  private async sweep(report: SupersededSweepReport, maxPerRun: number, cutOff: Date): Promise<SupersededSweepReport> {
    const mode = report.mode;
    let cursor: SupersededSweepCursor | null = null;

    while (report.scanned < maxPerRun) {
      const limit = Math.min(BATCH, maxPerRun - report.scanned);
      const batch = await this.assets.findSupersededBefore(cutOff, cursor, limit);
      if (batch.length === 0) break;

      const asked = await this.usage.inUse(batch.map((asset) => asset.id));
      if (asked.isFail) {
        this.logger.warn(
          `superseded narration sweep stopped: content-service could not answer (${asked.error}); nothing deleted from this batch`,
        );
        report.aborted = true;
        break;
      }
      const named = asked.value;
      report.scanned += batch.length;
      // Taken before the loop: restoring an asset clears the `supersededAt` the cursor needs.
      const last = batch[batch.length - 1]!;
      const next: SupersededSweepCursor = { supersededAt: last.supersededAt!, id: last.id };

      for (const asset of batch) {
        if (named.has(asset.id)) {
          report.inUse += 1;
          if (mode === 'dry-run') {
            this.logger.log(`[dry-run] would keep narration ${asset.id}: a lesson body still names it`);
            continue;
          }
          asset.restore();
          await this.assets.save(asset);
          continue;
        }

        report.unused += 1;
        if (mode === 'dry-run') {
          this.logger.log(
            `[dry-run] would delete narration ${asset.id} (replaced by ${asset.supersededBy ?? '-'} on ${asset.supersededAt?.toISOString()})`,
          );
          continue;
        }
        try {
          const purged = await this.purger.purge(asset);
          if (purged.isOk) report.deleted += 1;
        } catch (err) {
          this.logger.warn(`could not delete narration ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Restored and deleted assets leave the query; the cursor still moves past them, so a
      // dry run and a deleting run walk the same order.
      cursor = next;
      if (batch.length < limit) break;
    }

    this.logger.log(
      `superseded narration sweep (${mode}): scanned ${report.scanned}, in use ${report.inUse}, unused ${report.unused}, deleted ${report.deleted}${report.aborted ? ', ABORTED' : ''}`,
    );
    return report;
  }
}
