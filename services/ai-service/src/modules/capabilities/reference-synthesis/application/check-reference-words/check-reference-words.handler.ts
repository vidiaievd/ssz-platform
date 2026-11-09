import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  PRONUNCIATION_LEXICON_READER,
  type IPronunciationLexiconReader,
} from '../../../../pronunciation/application/ports/pronunciation-lexicon.reader.js';
import { referenceToneOf, referenceWordOf, type ReferenceWordCheck } from '../../domain/reference-clip.js';
import { CheckReferenceWordsQuery } from './check-reference-words.query.js';

/**
 * The refusals of `MakeReferenceClipHandler` that need no synthesis — not one word, no carrier
 * sentence, not in the lexicon, a homograph whose variants differ in toneme — for many words at
 * once, from one lexicon read. Nothing is called or billed. What it cannot tell is whether a voice
 * will pass the self-check (`rejected`): only synthesis shows that. A lexicon failure throws.
 */
@QueryHandler(CheckReferenceWordsQuery)
export class CheckReferenceWordsHandler implements IQueryHandler<CheckReferenceWordsQuery, ReferenceWordCheck[]> {
  constructor(@Inject(PRONUNCIATION_LEXICON_READER) private readonly lexicon: IPronunciationLexiconReader) {}

  async execute({ request }: CheckReferenceWordsQuery): Promise<ReferenceWordCheck[]> {
    const named = request.words.map((raw) => ({ raw, named: referenceWordOf(request.language, raw) }));
    const words = [...new Set(named.flatMap(({ named: n }) => ('word' in n ? [n.word] : [])))];
    const variants = words.length > 0 ? await this.lexicon.variantsOf(request.language, words) : new Map();

    return named.map(({ raw, named: n }): ReferenceWordCheck => {
      if ('refusal' in n) return { word: raw, status: 'refused', reason: n.refusal };
      const toned = referenceToneOf(variants.get(n.word) ?? []);
      return 'refusal' in toned
        ? { word: raw, status: 'refused', reason: toned.refusal }
        : { word: raw, status: 'ok', tone: toned.tone };
    });
  }
}
