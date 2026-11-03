import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { lexicalWord } from '../../providers/domain/lexical.js';
import { narrowVariants, tagsOfSpans, type PosToken } from '../domain/narrow-variants.js';
import { stressOfWord, type LexiconStress } from '../domain/word-stress.js';
import { POS_TAGGER, type IPosTagger } from './ports/pos-tagger.js';
import {
  PRONUNCIATION_LEXICON_READER,
  type IPronunciationLexiconReader,
} from './ports/pronunciation-lexicon.reader.js';
import { WORD_STRESS_CACHE, type IWordStressCache } from './ports/word-stress.cache.js';

/**
 * Bumped when what a span is answered with changes (the placement rule, the function words), so
 * the cache does not serve an old rule's marks. A lexicon reimport is not tracked: rare, and the
 * key's lifetime bounds it.
 */
const RULE_VERSION = 1;

export type Span = readonly [number, number];

/**
 * The lexicon's word stresses under a text (plan 86, step 5b, §4a decisions 4–5): free, for any
 * text, whether an author marked it or not. The caller counts the words (`spans`); the answer is
 * one entry per span. Homographs are narrowed by the tagger as in a review (plan 88, step 4b), and
 * the tagger failing only leaves them un-narrowed — mostly unmarked, since their variants then
 * disagree. The lexicon failing is a failure.
 */
@Injectable()
export class TextWordStresses {
  private readonly logger = new Logger(TextWordStresses.name);

  constructor(
    @Inject(PRONUNCIATION_LEXICON_READER) private readonly lexicon: IPronunciationLexiconReader,
    @Inject(POS_TAGGER) private readonly tagger: IPosTagger,
    @Inject(WORD_STRESS_CACHE) private readonly cache: IWordStressCache,
  ) {}

  async of(language: string, text: string, spans: readonly Span[]): Promise<Array<LexiconStress | null>> {
    if (spans.length === 0) return [];
    const key = cacheKey(language, text, spans);
    const hit = await this.cache.get(key);
    if (hit && hit.length === spans.length) return hit;

    const words = spans.map(([s, e]) => lexicalWord(text.slice(s, e)));
    const variants = await this.lexicon.variantsOf(language, words);
    // A language without a lexicon answers an empty map without a query; nothing to tag for.
    if (variants.size === 0) {
      const none = spans.map(() => null);
      await this.cache.set(key, none);
      return none;
    }
    const tokens = await this.tokens(language, text);
    const tags = tokens ? tagsOfSpans(text, spans, tokens) : [];

    const out = spans.map(([s, e], i) => {
      const tag = tags[i] ?? null;
      const narrowed = narrowVariants(variants.get(words[i]!) ?? [], tag);
      return stressOfWord(text.slice(s, e), narrowed.variants, tag?.upos ?? null);
    });
    // An untagged answer is not cached: the tagger back, the homographs get their marks.
    if (tokens) await this.cache.set(key, out);
    return out;
  }

  private async tokens(language: string, text: string): Promise<PosToken[] | null> {
    try {
      return await this.tagger.tag(language, text);
    } catch (err) {
      this.logger.warn(`Text not tagged, homographs not narrowed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}

/** `v<rule>:<language>:<sha256 of text and spans>`. */
export function cacheKey(language: string, text: string, spans: readonly Span[]): string {
  const hash = createHash('sha256').update(text).update('\0').update(JSON.stringify(spans)).digest('hex');
  return `v${RULE_VERSION}:${language}:${hash}`;
}
