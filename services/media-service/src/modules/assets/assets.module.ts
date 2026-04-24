import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BullModule } from '@nestjs/bullmq';
import { MEDIA_ASSET_REPOSITORY } from './domain/repositories/media-asset.repository.interface.js';
import { PrismaMediaAssetRepository } from './infrastructure/persistence/prisma-media-asset.repository.js';
import { RequestUploadHandler } from './application/commands/request-upload/request-upload.handler.js';
import { FinalizeUploadHandler } from './application/commands/finalize-upload/finalize-upload.handler.js';
import { DeleteAssetHandler } from './application/commands/delete-asset/delete-asset.handler.js';
import { GetAssetHandler } from './application/queries/get-asset/get-asset.handler.js';
import { ListUserAssetsHandler } from './application/queries/list-user-assets/list-user-assets.handler.js';
import { UploadsController } from './presentation/controllers/uploads.controller.js';
import { AssetsController } from './presentation/controllers/assets.controller.js';
import { QUEUE_AUDIO_PROCESSING, QUEUE_IMAGE_PROCESSING } from '../../infrastructure/queues/queue-names.js';

@Module({
  imports: [
    CqrsModule,
    BullModule.registerQueue(
      { name: QUEUE_IMAGE_PROCESSING },
      { name: QUEUE_AUDIO_PROCESSING },
    ),
  ],
  controllers: [UploadsController, AssetsController],
  providers: [
    RequestUploadHandler,
    FinalizeUploadHandler,
    DeleteAssetHandler,
    GetAssetHandler,
    ListUserAssetsHandler,
    {
      provide: MEDIA_ASSET_REPOSITORY,
      useClass: PrismaMediaAssetRepository,
    },
  ],
  exports: [MEDIA_ASSET_REPOSITORY],
})
export class AssetsModule {}
