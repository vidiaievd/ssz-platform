import { Inject, Injectable, Logger } from '@nestjs/common';
import { lexicalWords } from '../../providers/domain/lexical.js';
import type { PronouncedWord } from '../../providers/domain/speech-result.js';
import type { LexiconVariant } from '../domain/align-word.js';
import { narrowVariants, tagsOfPassageWords, type NarrowedBy, type PosToken } from '../domain/narrow-variants.js';
import { POS_TAGGER, type IPosTagger } from './ports/pos-tagger.js';
import {
  PRONUNCIATION_LEXICON_READER,
  type IPronunciationLexiconReader,
} from './ports/pronunciation-lexicon.reader.js';

/** A word of the passage with the lexicon variants its context leaves (plan 88, step 4b). */
export interface PassageWord {
  text: string;
  /** What the aligner names the word's sounds from; empty when the lexicon lacks the word. */
  variants: LexiconVariant[];
  narrowedBy: NarrowedBy;
  /** The tagger's UD part of speech; null when untagged. Tells a function word (step 5). */
  upos: string | null;
}

/**
 * The lexicon's variants of each word of a read passage, narrowed by part of speech where the
 * tagger answers (§0.8 (4)): tagged at request time, so an edited passage needs nothing. One
 * lexicon read and one tagger call per passage, side by side. The tagger failing is no failure
 * of the review — the words then keep all their variants, as before step 4b. The lexicon
 * failing is: it is the review's own database.
 */
@Injectable()
export class PassageVariants {
  private readonly logger = new Logger(PassageVariants.name);

  constructor(
    @Inject(PRONUNCIATION_LEXICON_READER) private readonly lexicon: IPronunciationLexiconReader,
    @Inject(POS_TAGGER) private readonly tagger: IPosTagger,
  ) {}

  async of(language: string, passage: string): Promise<PassageWord[]> {
    const words = lexicalWords(passage);
    const [variants, tokens] = await Promise.all([
      this.lexicon.variantsOf(language, words),
      this.tokens(language, passage),
    ]);
    const tags = tokens ? tagsOfPassageWords(passage, tokens) : [];
    return words.map((text, i) => {
      const tag = tags[i] ?? null;
      const narrowed = narrowVariants(variants.get(text) ?? [], tag);
      return { text, ...narrowed, upos: tag?.upos ?? null };
    });
  }

  private async tokens(language: string, passage: string): Promise<PosToken[] | null> {
    try {
      return await this.tagger.tag(language, passage);
    } catch (err) {
      this.logger.warn(
        `Passage not tagged, variants not narrowed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

/**
 * Azure's words beside the passage words they were read as: Azure lists the passage in order,
 * with an inserted word (not in the passage) between them. An insertion gets null.
 */
export function withPassageWords<W extends Pick<PronouncedWord, 'error'>>(
  pronounced: readonly W[],
  passage: readonly PassageWord[],
): Array<{ word: W; passageWord: PassageWord | null }> {
  let i = 0;
  return pronounced.map((word) => ({ word, passageWord: word.error === 'insertion' ? null : (passage[i++] ?? null) }));
}
