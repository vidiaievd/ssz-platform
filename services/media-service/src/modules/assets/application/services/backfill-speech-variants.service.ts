import { Inject, Injectable, Logger } from '@nestjs/common';
import { MEDIA_ASSET_REPOSITORY } from '../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../domain/repositories/media-asset.repository.interface.js';
import { SPEECH_VARIANT } from '../../domain/policies/recording-policy.js';
import { STORAGE_SERVICE } from '../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../shared/application/ports/storage.port.js';
import { SpeechVariantWriter } from './speech-variant-writer.js';

export type BackfillMode = 'dry-run' | 'write';

export interface SpeechBackfillReport {
  mode: BackfillMode;
  /** READY recordings without the speech variant, up to the limit. */
  found: number;
  /** Variants stored this run; always 0 in a dry run. */
  written: number;
  /** Ids whose conversion failed — they stay without the variant and come back next run. */
  failed: string[];
  /** Another run was still going on this node; this call did nothing. */
  skipped: boolean;
}

export const SPEECH_BACKFILL_MAX = 500;

/**
 * Writes the `speech` variant for recordings processed before it existed (plan 82, step 5),
 * so the shadow run of the voice review (step 10) can listen to the teacher-decided takes.
 * Run by an operator, a dry run unless asked otherwise, one bounded pass: a recording that
 * fails to convert is reported, not retried in the same call.
 */
@Injectable()
export class BackfillSpeechVariantsService {
  private readonly logger = new Logger(BackfillSpeechVariantsService.name);
  private running = false;

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assets: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    private readonly writer: SpeechVariantWriter,
  ) {}

  async run(options: { mode: BackfillMode; limit?: number }): Promise<SpeechBackfillReport> {
    const report: SpeechBackfillReport = { mode: options.mode, found: 0, written: 0, failed: [], skipped: false };
    if (this.running) {
      this.logger.warn('speech backfill skipped: another run is still going');
      return { ...report, skipped: true };
    }

    this.running = true;
    try {
      const limit = Math.min(Math.max(1, options.limit ?? SPEECH_BACKFILL_MAX), SPEECH_BACKFILL_MAX);
      const batch = await this.assets.findReadyRecordingsWithoutVariant(SPEECH_VARIANT, limit);
      report.found = batch.length;
      if (options.mode === 'dry-run') return report;

      for (const asset of batch) {
        try {
          // Recordings are private: never in the public bucket.
          const original = await this.storage.getObject(asset.storageKey.value, false);
          await this.writer.write(asset, original, asset.mimeType.value.split('/')[1] ?? 'audio');
          report.written += 1;
        } catch (err) {
          report.failed.push(asset.id);
          this.logger.warn(
            `Speech backfill failed for asset ${asset.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      this.logger.log(`speech backfill: ${report.written} written, ${report.failed.length} failed of ${report.found}`);
      return report;
    } finally {
      this.running = false;
    }
  }
}
