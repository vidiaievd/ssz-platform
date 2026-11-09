import { QueryBus, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { GetSoundAtomCatalogQuery } from '../../../../internal/application/queries/sound-atom-catalog/sound-atom-catalog.query.js';
import type {
  SoundAtomCatalog,
  SoundAtomCatalogEntry,
} from '../../../../internal/application/queries/sound-atom-catalog/sound-atom-catalog.handler.js';
import { GetSoundAtomQuery } from './get-sound-atom.query.js';

/** `nb:kj` — a language and a family, as ai-service and the catalogue spell them. */
const ATOM_ID = /^([a-z]{2,3}):([a-z_]{1,32})$/;

/** The primary subtag of a locale (`nb-NO` → `nb`); anything else is English. */
const LOCALE = /^([a-z]{2,3})(?:[-_][a-z0-9]+)*$/i;
const FALLBACK_LOCALE = 'en';

export function normaliseLocale(locale: string | undefined): string {
  const match = LOCALE.exec(locale?.trim() ?? '');
  return match ? match[1].toLowerCase() : FALLBACK_LOCALE;
}

/**
 * One sound of a language for the learner's card (plan 86, step 9.2): a slice of the language's
 * catalogue, which is cached for ten minutes per locale — so a card costs no query of its own,
 * and the card and ai-service's explanation always read the same text. Null for an id that is
 * not a catalogue row. The locale is cut to its primary subtag and a malformed one is English, so
 * what a learner sends reaches the cache key only as a two- or three-letter code.
 */
@QueryHandler(GetSoundAtomQuery)
export class GetSoundAtomHandler implements IQueryHandler<
  GetSoundAtomQuery,
  SoundAtomCatalogEntry | null
> {
  constructor(private readonly queryBus: QueryBus) {}

  async execute(query: GetSoundAtomQuery): Promise<SoundAtomCatalogEntry | null> {
    const id = ATOM_ID.exec(query.atomId.trim().toLowerCase());
    if (!id) return null;
    const catalog = await this.queryBus.execute<GetSoundAtomCatalogQuery, SoundAtomCatalog>(
      new GetSoundAtomCatalogQuery(id[1], normaliseLocale(query.locale)),
    );
    return catalog.atoms.find((atom) => atom.atomId === id[0]) ?? null;
  }
}
