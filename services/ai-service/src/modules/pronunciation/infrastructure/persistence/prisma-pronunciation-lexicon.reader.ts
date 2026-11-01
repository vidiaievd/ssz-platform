import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service.js';
import type { IPronunciationLexiconReader } from '../../application/ports/pronunciation-lexicon.reader.js';
import type { LexiconVariant } from '../../domain/align-word.js';
import { LEXICON_OF_LANGUAGE, lookupKeys, variantsByWord } from './lexicon.mapper.js';

/** `pronunciation_lexicon` through its (language, dialect, word_key) index. */
@Injectable()
export class PrismaPronunciationLexiconReader implements IPronunciationLexiconReader {
  constructor(private readonly prisma: PrismaService) {}

  async variantsOf(language: string, words: readonly string[]): Promise<Map<string, LexiconVariant[]>> {
    const lexicon = LEXICON_OF_LANGUAGE[language];
    const keys = lookupKeys(words);
    if (!lexicon || keys.length === 0) return new Map();
    const rows = await this.prisma.pronunciationEntry.findMany({
      where: { language, dialect: lexicon.dialect, source: lexicon.source, wordKey: { in: keys } },
      select: { wordKey: true, nofabet: true, pos: true, feats: true },
      orderBy: { id: 'asc' },
    });
    return variantsByWord(rows);
  }
}
