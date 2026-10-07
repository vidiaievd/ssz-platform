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
import { DescribeAssetsHandler } from './application/queries/describe-assets/describe-assets.handler.js';
import { GetPlaybackHandler } from './application/queries/get-playback/get-playback.handler.js';
import { AssetPurger } from './application/services/asset-purger.js';
import { SweepOrphanRecordingsService } from './application/services/sweep-orphan-recordings.service.js';
import { HttpRecordingUsageClient } from '../../infrastructure/http-recording-usage.client.js';
import { RECORDING_USAGE } from '../../shared/application/ports/recording-usage.port.js';
import { UploadsController } from './presentation/controllers/uploads.controller.js';
import { AssetsController } from './presentation/controllers/assets.controller.js';
import { InternalAssetsController } from './presentation/controllers/internal-assets.controller.js';
import { QUEUE_AUDIO_PROCESSING, QUEUE_IMAGE_PROCESSING } from '../../infrastructure/queues/queue-names.js';

@Module({
  imports: [
    CqrsModule,
    BullModule.registerQueue(
      { name: QUEUE_IMAGE_PROCESSING },
      { name: QUEUE_AUDIO_PROCESSING },
    ),
  ],
  controllers: [UploadsController, AssetsController, InternalAssetsController],
  providers: [
    RequestUploadHandler,
    FinalizeUploadHandler,
    AssetPurger,
    SweepOrphanRecordingsService,
    { provide: RECORDING_USAGE, useClass: HttpRecordingUsageClient },
    DeleteAssetHandler,
    GetAssetHandler,
    ListUserAssetsHandler,
    DescribeAssetsHandler,
    GetPlaybackHandler,
    {
      provide: MEDIA_ASSET_REPOSITORY,
      useClass: PrismaMediaAssetRepository,
    },
  ],
  exports: [MEDIA_ASSET_REPOSITORY, SweepOrphanRecordingsService],
})
export class AssetsModule {}
