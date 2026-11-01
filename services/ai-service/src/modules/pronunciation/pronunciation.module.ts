import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { PassageVariants } from './application/passage-variants.js';
import { POS_TAGGER } from './application/ports/pos-tagger.js';
import { PRONUNCIATION_LEXICON_READER } from './application/ports/pronunciation-lexicon.reader.js';
import { PrismaPronunciationLexiconReader } from './infrastructure/persistence/prisma-pronunciation-lexicon.reader.js';
import { HttpPosTagger } from './infrastructure/tagger/http-pos-tagger.js';

/**
 * Sound-level pronunciation review (plan 88): the lexicon, the sound inventory and the aligner
 * that names Azure's sounds, and the passage's variants narrowed by part of speech (step 4b).
 * The feedback built on them is step 5.
 */
@Module({
  providers: [
    { provide: PRONUNCIATION_LEXICON_READER, useClass: PrismaPronunciationLexiconReader },
    {
      provide: POS_TAGGER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => new HttpPosTagger(config.get<string>('posTaggerUrl')!),
    },
    PassageVariants,
  ],
  exports: [PRONUNCIATION_LEXICON_READER, PassageVariants],
})
export class PronunciationModule {}
