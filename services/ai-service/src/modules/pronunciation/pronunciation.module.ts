import { Module } from '@nestjs/common';
import { PRONUNCIATION_LEXICON_READER } from './application/ports/pronunciation-lexicon.reader.js';
import { PrismaPronunciationLexiconReader } from './infrastructure/persistence/prisma-pronunciation-lexicon.reader.js';

/**
 * Sound-level pronunciation review (plan 88): the lexicon, the sound inventory and the aligner
 * that names Azure's sounds. The feedback built on them is step 5.
 */
@Module({
  providers: [{ provide: PRONUNCIATION_LEXICON_READER, useClass: PrismaPronunciationLexiconReader }],
  exports: [PRONUNCIATION_LEXICON_READER],
})
export class PronunciationModule {}
