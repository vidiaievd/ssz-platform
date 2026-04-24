import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { QUEUE_IMAGE_PROCESSING } from '../../../infrastructure/queues/queue-names.js';
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

interface ProcessingJobData {
  assetId: string;
  jobId: string;
}

const IMAGE_VARIANTS = [
  { type: 'thumb_256', size: 256 },
  { type: 'thumb_512', size: 512 },
  { type: 'thumb_1024', size: 1024 },
] as const;

@Processor(QUEUE_IMAGE_PROCESSING)
export class ImageProcessorWorker extends WorkerHost {
  private readonly logger = new Logger(ImageProcessorWorker.name);

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
    this.logger.log(`Processing image job [${jobId}] for asset ${assetId}`);

    await this.prisma.processingJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      const asset = await this.assetRepo.findById(assetId);
      if (!asset) throw new Error(`Asset ${assetId} not found`);

      const isPublic = isPublicEntityType(asset.entityType);
      const originalBuffer = await this.storage.getObject(asset.storageKey.value, isPublic);

      const startResult = asset.startProcessing();
      if (startResult.isFail) throw new Error(`Cannot start processing: ${startResult.error}`);
      await this.assetRepo.save(asset);

      const variantInfos: Array<{ variantType: string; storageKey: string; mimeType: string; sizeBytes: bigint }> = [];

      for (const { type, size } of IMAGE_VARIANTS) {
        const resized = await sharp(originalBuffer)
          .resize(size, size, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer();

        const variantKey = asset.storageKey.variantKey(type, 'webp');

        await this.storage.uploadObject(variantKey.value, resized, 'image/webp', isPublic);

        await this.prisma.assetVariant.create({
          data: {
            assetId,
            variantType: type,
            storageKey: variantKey.value,
            mimeType: 'image/webp',
            sizeBytes: BigInt(resized.length),
          },
        });

        variantInfos.push({
          variantType: type,
          storageKey: variantKey.value,
          mimeType: 'image/webp',
          sizeBytes: BigInt(resized.length),
        });

        this.logger.debug(`Created variant ${type} (${resized.length} bytes) for asset ${assetId}`);
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

      this.logger.log(`Image processing complete for asset ${assetId}: ${variantInfos.length} variants created`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`Image processing failed for asset ${assetId}: ${reason}`);

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
          jobType: 'IMAGE_RESIZE',
          reason,
        };
        await this.events.publish(MEDIA_EVENT_TYPES.PROCESSING_FAILED, failedPayload).catch(() => undefined);
      }

      throw err;
    }
  }
}
