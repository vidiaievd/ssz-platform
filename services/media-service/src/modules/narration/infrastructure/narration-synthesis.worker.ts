import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { Job } from 'bullmq';

import { encodeMp3 } from '../../../infrastructure/audio/mp3-encoder.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { QUEUE_SPEECH_SYNTHESIS } from '../../../infrastructure/queues/queue-names.js';
import { StoreSynthesizedAudioCommand } from '../../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import type { StoreSynthesizedAudioResult } from '../../assets/application/commands/store-synthesized-audio/store-synthesized-audio.command.js';
import { MEDIA_ASSET_REPOSITORY } from '../../assets/domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../assets/domain/repositories/media-asset.repository.interface.js';
import type { NarrationJobData } from '../application/narration-job.js';
import { NarrationRenderer } from './narration-renderer.js';

/**
 * Source quality for the stored original. Processing re-encodes it into the opus and mp3
 * variants a student streams, so the original only has to be good enough to encode from.
 */
const ORIGINAL_BITRATE = '96k';

/**
 * Speaks a queued narration and hands the mp3 to the ordinary upload path: from finalize on,
 * the asset is measured, converted and turned READY by the audio worker like any recording.
 * A failure leaves the asset FAILED and the reason on its `processing_jobs` row.
 */
@Processor(QUEUE_SPEECH_SYNTHESIS)
export class NarrationSynthesisWorker extends WorkerHost {
  private readonly logger = new Logger(NarrationSynthesisWorker.name);

  constructor(
    private readonly renderer: NarrationRenderer,
    private readonly commandBus: CommandBus,
    private readonly prisma: PrismaService,
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
  ) {
    super();
  }

  async process(job: Job<NarrationJobData>): Promise<void> {
    const { assetId, jobId, ownerId, lang, segments, textHash, lengthScale, pauseScale, level, voiceId } = job.data;
    const started = Date.now();

    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const rendered = await this.renderer.render(lang, segments, { lengthScale, pauseScale }, voiceId);
      const mp3 = await encodeMp3(rendered.wav, ORIGINAL_BITRATE);

      const stored: StoreSynthesizedAudioResult = await this.commandBus.execute(
        new StoreSynthesizedAudioCommand(assetId, ownerId, mp3, 'audio/mpeg', {
          provider: rendered.provider,
          voice: rendered.voice,
          voiceId: rendered.voiceId,
          ...(rendered.speaker ? { speaker: rendered.speaker } : {}),
          lang,
          textHash,
          segments: segments.length,
          lengthScale,
          pauseScale,
          ...(level ? { level } : {}),
        }),
      );
      if (stored.isFail) throw new Error(`could not store the narration: ${stored.error}`);

      // The audio is stored and finalized; a bookkeeping failure must not turn it FAILED.
      await this.prisma.processingJob
        .update({ where: { id: jobId }, data: { status: 'COMPLETED', completedAt: new Date() } })
        .catch((e: unknown) => this.logger.warn(`Could not close job ${jobId}: ${String(e)}`));
      this.logger.log(
        `Narration ${assetId}: ${segments.length} segments, ${(rendered.durationMs / 1000).toFixed(1)} s of speech ` +
          `in ${((Date.now() - started) / 1000).toFixed(1)} s, ${mp3.length} bytes`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Narration ${assetId} failed: ${reason}`);

      await this.prisma.processingJob
        .update({ where: { id: jobId }, data: { status: 'FAILED', lastError: reason } })
        .catch(() => undefined);

      const asset = await this.assetRepo.findById(assetId).catch(() => null);
      if (asset && !asset.isDeleted && asset.markFailed().isOk) {
        await this.assetRepo.save(asset).catch(() => undefined);
      }
      throw err;
    }
  }
}
