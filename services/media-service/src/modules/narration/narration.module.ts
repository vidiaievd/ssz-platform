import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { QUEUE_SPEECH_SYNTHESIS } from '../../infrastructure/queues/queue-names.js';
import { MEDIA_ASSET_REPOSITORY } from '../assets/domain/repositories/media-asset.repository.interface.js';
import { PrismaMediaAssetRepository } from '../assets/infrastructure/persistence/prisma-media-asset.repository.js';
import { RequestNarrationHandler } from './application/commands/request-narration/request-narration.handler.js';
import { NarrationRenderer } from './infrastructure/narration-renderer.js';
import { NarrationSynthesisWorker } from './infrastructure/narration-synthesis.worker.js';
import { InternalNarrationController } from './presentation/internal-narration.controller.js';
import { NarrationController } from './presentation/narration.controller.js';

/**
 * Lesson narration by speech synthesis (plan 74). Simplified structure: the asset lifecycle
 * belongs to the assets module, which this one drives through its commands.
 */
@Module({
  imports: [CqrsModule, BullModule.registerQueue({ name: QUEUE_SPEECH_SYNTHESIS })],
  controllers: [NarrationController, InternalNarrationController],
  providers: [
    RequestNarrationHandler,
    NarrationRenderer,
    NarrationSynthesisWorker,
    { provide: MEDIA_ASSET_REPOSITORY, useClass: PrismaMediaAssetRepository },
  ],
})
export class NarrationModule {}
