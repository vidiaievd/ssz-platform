import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../../config/configuration.js';
import { MEDIA_ASSET_REPOSITORY } from '../../domain/repositories/media-asset.repository.interface.js';
import type {
  IMediaAssetRepository,
  RecordingSweepCursor,
} from '../../domain/repositories/media-asset.repository.interface.js';
import { LESSON_MEDIA_USAGE } from '../../../../shared/application/ports/lesson-media-usage.port.js';
import type { ILessonMediaUsage } from '../../../../shared/application/ports/lesson-media-usage.port.js';
import { AssetPurger } from './asset-purger.js';
import type { SweepMode } from './sweep-orphan-recordings.service.js';

/** The kinds content-service can answer for: lesson files (5.2) and exercise clips (5.3). */
export const SWEPT_CONTENT_TYPES: readonly string[] = ['lesson_asset', 'exercise_asset'];

export interface ContentSweepReport {
  mode: SweepMode;
  /** Content assets old enough to be asked about. */
  scanned: number;
  /** Of those, the ones content still names — never touched. */
  inUse: number;
  /** The rest: nothing in content names them. */
  orphans: number;
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
 * Removes uploaded content files nothing names (plan 76, phase 5): an image or a clip put into
 * a lesson or an exercise and taken out again, or uploaded and never placed. content-service owns the
 * references, so the rules are the orphan-recording sweep's (plan 71) with it in the engine's
 * place:
 *
 *  1. **Doubt is not deletion.** If content-service cannot answer, the run stops.
 *  2. **Young files are not asked about** (`MEDIA_ORPHAN_MIN_AGE_DAYS`): an upload may sit in
 *     an editor that has not saved yet.
 *  3. **Replaced narrations are not ours.** Their retention sweep keeps them restorable for
 *     `NARRATION_RETENTION_DAYS`; the repository query leaves them out.
 *  4. **A dry run is the default** (`MEDIA_ORPHAN_SWEEP_MODE`).
 *  5. **A run is bounded** (`MEDIA_ORPHAN_MAX_PER_RUN`).
 */
@Injectable()
export class SweepOrphanContentAssetsService {
  private readonly logger = new Logger(SweepOrphanContentAssetsService.name);
  private running = false;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: IMediaAssetRepository,
    @Inject(LESSON_MEDIA_USAGE) private readonly usage: ILessonMediaUsage,
    private readonly purger: AssetPurger,
    private readonly config: ConfigService<AppConfig>,
  ) {}

  /** `mode` overrides the configured one — a manual run asks for a dry run explicitly. */
  async run(options: { mode?: SweepMode; now?: Date } = {}): Promise<ContentSweepReport> {
    const cfg = this.config.get<AppConfig['orphanSweep']>('orphanSweep')!;
    const mode = options.mode ?? cfg.mode;
    const now = options.now ?? new Date();
    const cutOff = new Date(now.getTime() - cfg.minAgeDays * DAY_MS);

    const report: ContentSweepReport = {
      mode,
      scanned: 0,
      inUse: 0,
      orphans: 0,
      deleted: 0,
      aborted: false,
      skipped: false,
    };

    if (this.running) {
      this.logger.warn('orphan content sweep skipped: another run is still going');
      return { ...report, skipped: true };
    }
    this.running = true;
    try {
      return await this.sweep(report, cfg.maxPerRun, cutOff);
    } finally {
      this.running = false;
    }
  }

  private async sweep(report: ContentSweepReport, maxPerRun: number, cutOff: Date): Promise<ContentSweepReport> {
    let cursor: RecordingSweepCursor | null = null;

    while (report.scanned < maxPerRun) {
      const limit = Math.min(BATCH, maxPerRun - report.scanned);
      const batch = await this.assets.findContentAssetsOlderThan(SWEPT_CONTENT_TYPES, cutOff, cursor, limit);
      if (batch.length === 0) break;

      const asked = await this.usage.inUse(batch.map((asset) => asset.id));
      if (asked.isFail) {
        this.logger.warn(
          `orphan content sweep stopped: content-service could not answer (${asked.error}); nothing deleted from this batch`,
        );
        report.aborted = true;
        break;
      }
      const named = asked.value;

      const orphans = batch.filter((asset) => !named.has(asset.id));
      report.scanned += batch.length;
      report.inUse += batch.length - orphans.length;
      report.orphans += orphans.length;

      for (const asset of orphans) {
        if (report.mode === 'dry-run') {
          this.logger.log(
            `[dry-run] would delete ${asset.entityType} ${asset.id} (${asset.mimeType.value}, ${asset.createdAt.toISOString()})`,
          );
          continue;
        }
        try {
          const purged = await this.purger.purge(asset);
          if (purged.isOk) report.deleted += 1;
        } catch (err) {
          // One bad object must not stop the run; it is simply asked about again next time.
          this.logger.warn(`could not delete ${asset.entityType} ${asset.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      const last = batch[batch.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };
      if (batch.length < limit) break;
    }

    this.logger.log(
      `orphan content sweep (${report.mode}): scanned ${report.scanned}, in use ${report.inUse}, orphans ${report.orphans}, deleted ${report.deleted}${report.aborted ? ', ABORTED' : ''}`,
    );
    return report;
  }
}
