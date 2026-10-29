import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { BullModule } from '@nestjs/bullmq';
import { MEDIA_ASSET_REPOSITORY } from './domain/repositories/media-asset.repository.interface.js';
import { PrismaMediaAssetRepository } from './infrastructure/persistence/prisma-media-asset.repository.js';
import { RequestUploadHandler } from './application/commands/request-upload/request-upload.handler.js';
import { FinalizeUploadHandler } from './application/commands/finalize-upload/finalize-upload.handler.js';
import { StoreSynthesizedAudioHandler } from './application/commands/store-synthesized-audio/store-synthesized-audio.handler.js';
import { SupersedeAssetHandler } from './application/commands/supersede-asset/supersede-asset.handler.js';
import { DeleteAssetHandler } from './application/commands/delete-asset/delete-asset.handler.js';
import { EraseOwnerAssetsHandler } from './application/commands/erase-owner-assets/erase-owner-assets.handler.js';
import { UserDeletedConsumer } from './infrastructure/events/user-deleted.consumer.js';
import { GetAssetHandler } from './application/queries/get-asset/get-asset.handler.js';
import { ListUserAssetsHandler } from './application/queries/list-user-assets/list-user-assets.handler.js';
import { DescribeAssetsHandler } from './application/queries/describe-assets/describe-assets.handler.js';
import { GetPreviousAssetHandler } from './application/queries/get-previous-asset/get-previous-asset.handler.js';
import { GetPlaybackHandler } from './application/queries/get-playback/get-playback.handler.js';
import { AssetPurger } from './application/services/asset-purger.js';
import { SweepOrphanRecordingsService } from './application/services/sweep-orphan-recordings.service.js';
import { SweepAbandonedUploadsService } from './application/services/sweep-abandoned-uploads.service.js';
import { SweepOrphanContentAssetsService } from './application/services/sweep-orphan-content-assets.service.js';
import { SweepSupersededNarrationsService } from './application/services/sweep-superseded-narrations.service.js';
import { SpeechVariantWriter } from './application/services/speech-variant-writer.js';
import { BackfillSpeechVariantsService } from './application/services/backfill-speech-variants.service.js';
import { HttpLessonMediaUsageClient } from '../../infrastructure/http-lesson-media-usage.client.js';
import { LESSON_MEDIA_USAGE } from '../../shared/application/ports/lesson-media-usage.port.js';
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
    StoreSynthesizedAudioHandler,
    SupersedeAssetHandler,
    AssetPurger,
    SweepOrphanRecordingsService,
    SweepSupersededNarrationsService,
    SweepAbandonedUploadsService,
    SweepOrphanContentAssetsService,
    SpeechVariantWriter,
    BackfillSpeechVariantsService,
    { provide: RECORDING_USAGE, useClass: HttpRecordingUsageClient },
    { provide: LESSON_MEDIA_USAGE, useClass: HttpLessonMediaUsageClient },
    DeleteAssetHandler,
    EraseOwnerAssetsHandler,
    UserDeletedConsumer,
    GetAssetHandler,
    ListUserAssetsHandler,
    DescribeAssetsHandler,
    GetPlaybackHandler,
    GetPreviousAssetHandler,
    {
      provide: MEDIA_ASSET_REPOSITORY,
      useClass: PrismaMediaAssetRepository,
    },
  ],
  exports: [
    MEDIA_ASSET_REPOSITORY,
    SweepOrphanRecordingsService,
    SweepSupersededNarrationsService,
    SweepAbandonedUploadsService,
    SweepOrphanContentAssetsService,
  ],
})
export class AssetsModule {}
