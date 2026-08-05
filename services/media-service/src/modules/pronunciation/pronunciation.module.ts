import { Module } from '@nestjs/common';

import { PronunciationController } from './pronunciation.controller.js';
import { PronunciationService } from './pronunciation.service.js';

/**
 * Simplified structure (CLAUDE.md §"When to use simplified structure"): one
 * service over the storage port, no domain model of its own — a pronunciation
 * clip is a derived artifact keyed by its text, not an entity with a lifecycle.
 */
@Module({
  controllers: [PronunciationController],
  providers: [PronunciationService],
})
export class PronunciationModule {}
