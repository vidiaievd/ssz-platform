import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service.js';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '../../../../../shared/application/ports/cache.port.js';
import { GetSoundAtomCatalogQuery } from './sound-atom-catalog.query.js';

export interface SoundAtomCatalogEntry {
  /** `nb:kj` — the id ai-service flags and the engine stores. */
  atomId: string;
  family: string;
  ipa: string;
  /** ai-service measures the family and may flag it; otherwise the course teaches it only. */
  scored: boolean;
  /** The locale the texts below are in — the asked one, or `en` when it has none. */
  locale: string;
  title: string;
  description: string | null;
  howTo: string | null;
  commonError: string | null;
  ukNote: string | null;
  drill: string | null;
  carrierWords: string[];
}

export interface SoundAtomCatalog {
  language: string;
  locale: string;
  atoms: SoundAtomCatalogEntry[];
}

const FALLBACK_LOCALE = 'en';

/**
 * Ten minutes, as the grammar catalogue. The rows change only by a seed run; a text edited a
 * few minutes ago reaching a model late costs nothing.
 */
const CATALOG_TTL_SECONDS = 10 * 60;

const cacheKey = (language: string, locale: string) =>
  `content:sound-atom-catalog:${language}:${locale}`;

interface TextRow {
  locale: string;
  title: string;
  description: string | null;
  howTo: string | null;
  commonError: string | null;
  ukNote: string | null;
  drill: string | null;
}

/**
 * Every `sound` atom of a language in course order, with its texts in one locale (plan 86,
 * step 8.1, Q18). The whole inventory, not a course's: the families are the language's, and
 * ai-service names any of the scored ones in any reading. An unknown language is an empty
 * catalogue, not a 404 — the caller falls back to its own inventory notes either way.
 */
@QueryHandler(GetSoundAtomCatalogQuery)
export class GetSoundAtomCatalogHandler implements IQueryHandler<
  GetSoundAtomCatalogQuery,
  SoundAtomCatalog
> {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async execute(query: GetSoundAtomCatalogQuery): Promise<SoundAtomCatalog> {
    const language = query.language.toLowerCase();
    const locale = query.locale.toLowerCase();
    const key = cacheKey(language, locale);
    const cached = await this.cache.get<SoundAtomCatalog>(key);
    if (cached !== null) return cached;

    const rows = await this.prisma.soundAtom.findMany({
      where: { language },
      orderBy: { position: 'asc' },
      include: { texts: { where: { locale: { in: [...new Set([locale, FALLBACK_LOCALE])] } } } },
    });

    const atoms = rows.flatMap((row): SoundAtomCatalogEntry[] => {
      const text = pickText(row.texts, locale);
      if (!text) return [];
      return [
        {
          atomId: row.id,
          family: row.family,
          ipa: row.ipa,
          scored: row.scored,
          locale: text.locale,
          title: text.title,
          description: text.description,
          howTo: text.howTo,
          commonError: text.commonError,
          ukNote: text.ukNote,
          drill: text.drill,
          carrierWords: row.carrierWords,
        },
      ];
    });

    const catalog: SoundAtomCatalog = { language, locale, atoms };
    await this.cache.set(key, catalog, CATALOG_TTL_SECONDS);
    return catalog;
  }
}

/** The asked locale's text, else English; an atom with neither is not shown at all. */
function pickText(texts: readonly TextRow[], locale: string): TextRow | null {
  return (
    texts.find((t) => t.locale === locale) ??
    texts.find((t) => t.locale === FALLBACK_LOCALE) ??
    null
  );
}
