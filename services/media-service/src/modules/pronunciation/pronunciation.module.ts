import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AssetsModule } from '../assets/assets.module.js';

import { PronunciationClipService } from './pronunciation-clip.service.js';
import { InternalPronunciationController } from './internal-pronunciation.controller.js';
import { PronunciationController } from './pronunciation.controller.js';
import { PronunciationService } from './pronunciation.service.js';
import { ReferenceClipService } from './reference-clip.service.js';

/**
 * Simplified structure (CLAUDE.md §"When to use simplified structure"): one
 * service over the storage port, no domain model of its own — a pronunciation
 * clip is a derived artifact keyed by its text, not an entity with a lifecycle.
 * A reference clip (plan 88) is an asset of the platform, found by its word.
 */
@Module({
  imports: [CqrsModule, AssetsModule],
  controllers: [PronunciationController, InternalPronunciationController],
  providers: [PronunciationService, PronunciationClipService, ReferenceClipService],
})
export class PronunciationModule {}
