import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { PassageSounds } from './application/passage-sounds.js';
import { PassageVariants } from './application/passage-variants.js';
import { TextWordStresses } from './application/text-word-stresses.js';
import { WORD_STRESS_CACHE } from './application/ports/word-stress.cache.js';
import { PITCH_TRACKER } from './application/ports/pitch-tracker.js';
import { POS_TAGGER } from './application/ports/pos-tagger.js';
import { PRONUNCIATION_LEXICON_READER } from './application/ports/pronunciation-lexicon.reader.js';
import { PrismaPronunciationLexiconReader } from './infrastructure/persistence/prisma-pronunciation-lexicon.reader.js';
import { RedisWordStressCache } from './infrastructure/cache/redis-word-stress.cache.js';
import { HttpPitchTracker } from './infrastructure/pitch/http-pitch-tracker.js';
import { HttpPosTagger } from './infrastructure/tagger/http-pos-tagger.js';
import { InternalWordStressesController } from './presentation/internal-word-stresses.controller.js';

/**
 * Sound-level pronunciation review (plan 88): the lexicon, the sound inventory and the aligner
 * that names Azure's sounds, the passage's variants narrowed by part of speech (step 4b) and
 * the weak sounds of a passage read (step 5), and the pitch tracker tonemes are measured with (step 6a).
 * Plan 86, step 5b: the lexicon's word stresses under any text, for the prosody layer.
 */
@Module({
  controllers: [InternalWordStressesController],
  providers: [
    { provide: PRONUNCIATION_LEXICON_READER, useClass: PrismaPronunciationLexiconReader },
    {
      provide: POS_TAGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => new HttpPosTagger(config.get<string>('posTaggerUrl')!),
    },
    {
      provide: PITCH_TRACKER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => new HttpPitchTracker(config.get<string>('pitchTrackerUrl')!),
    },
    { provide: WORD_STRESS_CACHE, useClass: RedisWordStressCache },
    PassageVariants,
    PassageSounds,
    TextWordStresses,
  ],
  exports: [PRONUNCIATION_LEXICON_READER, PITCH_TRACKER, PassageVariants, PassageSounds],
})
export class PronunciationModule {}
