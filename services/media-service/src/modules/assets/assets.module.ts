import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BullModule } from '@nestjs/bullmq';
import { MEDIA_ASSET_REPOSITORY } from './domain/repositories/media-asset.repository.interface.js';
import { PrismaMediaAssetRepository } from './infrastructure/persistence/prisma-media-asset.repository.js';
import { RequestUploadHandler } from './application/commands/request-upload/request-upload.handler.js';
import { FinalizeUploadHandler } from './application/commands/finalize-upload/finalize-upload.handler.js';
import { UploadsController } from './presentation/controllers/uploads.controller.js';
import { QUEUE_AUDIO_PROCESSING, QUEUE_IMAGE_PROCESSING } from '../../infrastructure/queues/queue-names.js';

@Module({
  imports: [
    CqrsModule,
    BullModule.registerQueue(
      { name: QUEUE_IMAGE_PROCESSING },
      { name: QUEUE_AUDIO_PROCESSING },
    ),
  ],
  controllers: [UploadsController],
  providers: [
    RequestUploadHandler,
    FinalizeUploadHandler,
    {
      provide: MEDIA_ASSET_REPOSITORY,
      useClass: PrismaMediaAssetRepository,
    },
  ],
  exports: [MEDIA_ASSET_REPOSITORY],
})
export class AssetsModule {}
