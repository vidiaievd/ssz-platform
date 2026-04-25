import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_IMAGE_PROCESSING, QUEUE_AUDIO_PROCESSING } from '../../infrastructure/queues/queue-names.js';
import { MEDIA_ASSET_REPOSITORY } from '../assets/domain/repositories/media-asset.repository.interface.js';
import { PrismaMediaAssetRepository } from '../assets/infrastructure/persistence/prisma-media-asset.repository.js';
import { ImageProcessorWorker } from './image/image-processor.worker.js';
import { AudioProcessorWorker } from './audio/audio-processor.worker.js';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_IMAGE_PROCESSING },
      { name: QUEUE_AUDIO_PROCESSING },
    ),
  ],
  providers: [
    ImageProcessorWorker,
    AudioProcessorWorker,
    {
      provide: MEDIA_ASSET_REPOSITORY,
      useClass: PrismaMediaAssetRepository,
    },
  ],
})
export class ProcessingModule {}
