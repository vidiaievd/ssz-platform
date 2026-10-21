import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { MEDIA_ASSET_REPOSITORY } from '../../domain/repositories/media-asset.repository.interface.js';
import type {
  IMediaAssetRepository,
  RecordingSweepCursor,
} from '../../domain/repositories/media-asset.repository.interface.js';
import { AssetPurger } from './asset-purger.js';
import type { SweepMode } from './sweep-orphan-recordings.service.js';

export interface AbandonedUploadSweepReport {
  mode: SweepMode;
  /** Uploads still pending past the minimum age — every one of them is abandoned. */
  scanned: number;
  /** Purged this run; always 0 in a dry run. */
  deleted: number;
  /** Another run was still going on this node; this call did nothing. */
  skipped: boolean;
}

const BATCH = 200;
const DAY_MS = 86_400_000;

/**
 * Removes uploads that were asked for and never finished (plan 76, 5.1): the row was made,
 * the presigned URL handed out, and the file never confirmed. The URL lives minutes, so a row
 * still pending after the minimum age can no longer become a file — nobody is asked whether
 * it is in use, because something with no bytes cannot be played by anyone.
 *
 * The other rules are the orphan-recording sweep's (plan 71): only rows older than
 * `MEDIA_ORPHAN_MIN_AGE_DAYS`, a dry run by default (`MEDIA_ORPHAN_SWEEP_MODE`), and a bounded
 * run (`MEDIA_ORPHAN_MAX_PER_RUN`). Purging also removes any object a client did put into
 * storage without confirming it.
 */
@Injectable()
export class SweepAbandonedUploadsService {
  private readonly logger = new Logger(SweepAbandonedUploadsService.name);
  private running = false;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: IMediaAssetRepository,
    private readonly purger: AssetPurger,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** `mode` overrides the configured one — a manual run asks for a dry run explicitly. */
  async run(options: { mode?: SweepMode; now?: Date } = {}): Promise<AbandonedUploadSweepReport> {
    const cfg = this.config.get<AppConfig['orphanSweep']>('orphanSweep')!;
    const mode = options.mode ?? cfg.mode;
    const now = options.now ?? new Date();
    const cutOff = new Date(now.getTime() - cfg.minAgeDays * DAY_MS);

    const report: AbandonedUploadSweepReport = { mode, scanned: 0, deleted: 0, skipped: false };

    if (this.running) {
      this.logger.warn('abandoned upload sweep skipped: another run is still going');
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
    report: AbandonedUploadSweepReport,
    cfg: AppConfig['orphanSweep'],
    cutOff: Date,
  ): Promise<AbandonedUploadSweepReport> {
    let cursor: RecordingSweepCursor | null = null;

    while (report.scanned < cfg.maxPerRun) {
      const limit = Math.min(BATCH, cfg.maxPerRun - report.scanned);
      const batch = await this.assets.findAbandonedUploadsOlderThan(cutOff, cursor, limit);
      if (batch.length === 0) break;
      report.scanned += batch.length;

      for (const asset of batch) {
        if (report.mode === 'dry-run') {
          this.logger.log(
            `[dry-run] would delete abandoned upload ${asset.id} (${asset.entityType ?? '-'}, ${asset.createdAt.toISOString()})`,
          );
          continue;
        }
        try {
          const purged = await this.purger.purge(asset);
          if (purged.isOk) report.deleted += 1;
        } catch (err) {
          // One bad object must not stop the run; it is simply found again next time.
          this.logger.warn(`could not delete abandoned upload ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const last = batch[batch.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (batch.length < limit) break;
    }

    this.logger.log(`abandoned upload sweep (${report.mode}): scanned ${report.scanned}, deleted ${report.deleted}`);
    return report;
  }
}
