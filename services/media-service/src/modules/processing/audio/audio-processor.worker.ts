import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import ffmpeg = require('fluent-ffmpeg');
import ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
import ffprobeInstaller = require('@ffprobe-installer/ffprobe');
import { writeFile, readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { QUEUE_AUDIO_PROCESSING } from '../../../infrastructure/queues/queue-names.js';
import { STORAGE_SERVICE } from '../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../shared/application/ports/storage.port.js';
import { MEDIA_ASSET_REPOSITORY } from '../../assets/domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../assets/domain/repositories/media-asset.repository.interface.js';
import { EVENT_PUBLISHER } from '../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../shared/application/ports/event-publisher.port.js';
import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import { MEDIA_EVENT_TYPES } from '@ssz/contracts';
import type { MediaProcessedPayload, MediaProcessingFailedPayload } from '@ssz/contracts';
import { isPublicEntityType } from '../../../shared/application/ports/storage.port.js';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

interface ProcessingJobData {
  assetId: string;
  jobId: string;
}

interface AudioVariantSpec {
  type: string;
  extension: string;
  mimeType: string;
  audioCodec: string;
  audioBitrate: string;
  audioFilters: string[];
}

const AUDIO_VARIANTS: AudioVariantSpec[] = [
  {
    type: 'opus',
    extension: 'opus',
    mimeType: 'audio/ogg',
    audioCodec: 'libopus',
    audioBitrate: '64k',
    audioFilters: ['loudnorm=I=-16:TP=-1.5:LRA=11'],
  },
  {
    type: 'mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    audioCodec: 'libmp3lame',
    audioBitrate: '128k',
    audioFilters: ['loudnorm=I=-16:TP=-1.5:LRA=11'],
  },
];

@Processor(QUEUE_AUDIO_PROCESSING)
export class AudioProcessorWorker extends WorkerHost {
  private readonly logger = new Logger(AudioProcessorWorker.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: IStorageService,
    @Inject(MEDIA_ASSET_REPOSITORY) private readonly assetRepo: IMediaAssetRepository,
    @Inject(EVENT_PUBLISHER) private readonly events: IEventPublisher,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<ProcessingJobData>): Promise<void> {
    const { assetId, jobId } = job.data;
    this.logger.log(`Processing audio job [${jobId}] for asset ${assetId}`);

    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });

    const tmpDir = await mkdtemp(join(tmpdir(), `ssz-audio-${assetId}-`));

    try {
      const asset = await this.assetRepo.findById(assetId);
      if (!asset) throw new Error(`Asset ${assetId} not found`);

      const isPublic = isPublicEntityType(asset.entityType);
      const originalBuffer = await this.storage.getObject(asset.storageKey.value, isPublic);

      // Determine original extension from mime type
      const ext = asset.mimeType.value.split('/')[1] ?? 'audio';
      const inputPath = join(tmpDir, `original.${ext}`);
      await writeFile(inputPath, originalBuffer);

      const startResult = asset.startProcessing();
      if (startResult.isFail) throw new Error(`Cannot start processing: ${startResult.error}`);
      await this.assetRepo.save(asset);

      const variantInfos: Array<{ variantType: string; storageKey: string; mimeType: string; sizeBytes: bigint }> = [];

      for (const spec of AUDIO_VARIANTS) {
        const outputPath = join(tmpDir, `output.${spec.extension}`);

        await this.convertAudio(inputPath, outputPath, spec);

        const outputBuffer = await readFile(outputPath);
        const variantKey = asset.storageKey.variantKey(spec.type, spec.extension);

        await this.storage.uploadObject(variantKey.value, outputBuffer, spec.mimeType, isPublic);

        await this.prisma.assetVariant.create({
          data: {
            assetId,
            variantType: spec.type,
            storageKey: variantKey.value,
            mimeType: spec.mimeType,
            sizeBytes: BigInt(outputBuffer.length),
          },
        });

        variantInfos.push({
          variantType: spec.type,
          storageKey: variantKey.value,
          mimeType: spec.mimeType,
          sizeBytes: BigInt(outputBuffer.length),
        });

        this.logger.debug(`Created audio variant ${spec.type} (${outputBuffer.length} bytes) for asset ${assetId}`);
      }

      const readyResult = asset.markReady(variantInfos);
      if (readyResult.isFail) throw new Error(`Cannot mark ready: ${readyResult.error}`);
      await this.assetRepo.save(asset);

      const payload: MediaProcessedPayload = {
        assetId,
        ownerId: asset.ownerId,
        variants: variantInfos.map(v => ({
          variantType: v.variantType,
          storageKey: v.storageKey,
          mimeType: v.mimeType,
          sizeBytes: Number(v.sizeBytes),
        })),
      };
      await this.events.publish(MEDIA_EVENT_TYPES.PROCESSED, payload);

      await this.prisma.processingJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      this.logger.log(`Audio processing complete for asset ${assetId}: ${variantInfos.length} variants created`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Audio processing failed for asset ${assetId}: ${reason}`);

      await this.prisma.processingJob
        .update({ where: { id: jobId }, data: { status: 'FAILED', lastError: reason } })
        .catch(() => undefined);

      const asset = await this.assetRepo.findById(assetId).catch(() => null);
      if (asset && !asset.isDeleted) {
        asset.markFailed();
        await this.assetRepo.save(asset).catch(() => undefined);

        const failedPayload: MediaProcessingFailedPayload = {
          assetId,
          ownerId: asset.ownerId,
          jobType: 'AUDIO_CONVERT',
          reason,
        };
        await this.events.publish(MEDIA_EVENT_TYPES.PROCESSING_FAILED, failedPayload).catch(() => undefined);
      }

      throw err;
    } finally {
      await this.cleanupTmpDir(tmpDir);
    }
  }

  private convertAudio(inputPath: string, outputPath: string, spec: AudioVariantSpec): Promise<void> {
    return new Promise((resolve, reject) => {
      let command = ffmpeg(inputPath)
        .audioCodec(spec.audioCodec)
        .audioBitrate(spec.audioBitrate)
        .noVideo();

      for (const filter of spec.audioFilters) {
        command = command.audioFilter(filter);
      }

      command
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: Error) => reject(new Error(`ffmpeg error: ${err.message}`)))
        .run();
    });
  }

  private async cleanupTmpDir(dir: string): Promise<void> {
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(dir);
      await Promise.all(files.map(f => unlink(join(dir, f)).catch(() => undefined)));
      const { rmdir } = await import('fs/promises');
      await rmdir(dir).catch(() => undefined);
    } catch {
      // Non-fatal cleanup failure
    }
  }
}
