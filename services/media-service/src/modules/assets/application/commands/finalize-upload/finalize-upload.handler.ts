import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { FinalizeUploadCommand, type FinalizeUploadResult } from './finalize-upload.command.js';
import { MediaAssetDomainError } from '../../../domain/exceptions/media-asset.exceptions.js';
import { MEDIA_ASSET_REPOSITORY } from '../../../domain/repositories/media-asset.repository.interface.js';
import type { IMediaAssetRepository } from '../../../domain/repositories/media-asset.repository.interface.js';
import { STORAGE_SERVICE, isPublicEntityType } from '../../../../../shared/application/ports/storage.port.js';
import type { IStorageService } from '../../../../../shared/application/ports/storage.port.js';
import { EVENT_PUBLISHER } from '../../../../../shared/application/ports/event-publisher.port.js';
import type { IEventPublisher } from '../../../../../shared/application/ports/event-publisher.port.js';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import { QUEUE_IMAGE_PROCESSING, QUEUE_AUDIO_PROCESSING } from '../../../../../infrastructure/queues/queue-names.js';
import { Result } from '../../../../../shared/kernel/result.js';
import type { MediaUploadedPayload } from '@ssz/contracts';
import { MEDIA_EVENT_TYPES } from '@ssz/contracts';

@CommandHandler(FinalizeUploadCommand)
export class FinalizeUploadHandler implements ICommandHandler<FinalizeUploadCommand, FinalizeUploadResult> {
  private readonly logger = new Logger(FinalizeUploadHandler.name);

  constructor(
    @Inject(MEDIA_ASSET_REPOSITORY)
    private readonly assetRepo: IMediaAssetRepository,
    @Inject(STORAGE_SERVICE)
    private readonly storage: IStorageService,
    @Inject(EVENT_PUBLISHER)
    private readonly eventPublisher: IEventPublisher,
    @InjectQueue(QUEUE_IMAGE_PROCESSING)
    private readonly imageQueue: Queue,
    @InjectQueue(QUEUE_AUDIO_PROCESSING)
    private readonly audioQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async execute(command: FinalizeUploadCommand): Promise<FinalizeUploadResult> {
    const asset = await this.assetRepo.findByIdAndOwner(command.assetId, command.ownerId);
    if (!asset) return Result.fail('ASSET_NOT_FOUND');

    if (!asset.isPendingUpload) {
      return Result.fail(MediaAssetDomainError.INVALID_STATUS_TRANSITION);
    }

    const isPublic = isPublicEntityType(asset.entityType);
    const metadata = await this.storage.getObjectMetadata(asset.storageKey.value, isPublic);

    if (!metadata) {
      return Result.fail('FILE_NOT_FOUND_IN_STORAGE');
    }

    const markResult = asset.markUploaded();
    if (markResult.isFail) return Result.fail(markResult.error);

    await this.assetRepo.save(asset);

    const payload: MediaUploadedPayload = {
      assetId: asset.id,
      ownerId: asset.ownerId,
      mimeType: asset.mimeType.value,
      sizeBytes: asset.sizeBytes.asNumber,
      storageKey: asset.storageKey.value,
      entityType: asset.entityType,
      entityId: asset.entityId,
    };

    await this.eventPublisher.publish(MEDIA_EVENT_TYPES.UPLOADED, payload);

    await this.enqueueProcessingIfNeeded(command.assetId, asset.mimeType.isImage, asset.mimeType.isAudio);

    return Result.ok();
  }

  private async enqueueProcessingIfNeeded(
    assetId: string,
    isImage: boolean,
    isAudio: boolean,
  ): Promise<void> {
    if (!isImage && !isAudio) return;

    const jobType = isImage ? 'IMAGE_RESIZE' : 'AUDIO_CONVERT';
    const queue = isImage ? this.imageQueue : this.audioQueue;

    try {
      const job = await this.prisma.processingJob.create({
        data: {
          assetId,
          type: jobType,
          status: 'PENDING',
        },
      });

      await queue.add(
        jobType,
        { assetId, jobId: job.id },
        {
          jobId: job.id,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: { count: 100 },
          removeOnFail: false,
        },
      );

      this.logger.log(`Enqueued ${jobType} job [${job.id}] for asset ${assetId}`);
    } catch (err) {
      // Job creation failure is non-fatal — asset is already UPLOADED.
      // The missing job will be detected by a reconciliation process in future sprints.
      this.logger.error(
        `Failed to enqueue processing job for asset ${assetId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
