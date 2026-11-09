import type { ISoundBaseReader } from '../application/ports/sound-base.reader.js';
import type { SoundBaseEntry } from '../domain/sound-base.js';

interface CatalogueAtom {
  atomId: string;
  family: string;
  locale: string;
  title: string;
  description: string | null;
  howTo: string | null;
  commonError: string | null;
  ukNote: string | null;
  drill: string | null;
  carrierWords?: string[];
}

/**
 * content-service `GET /api/v1/internal/sound-atoms?language=&locale=` (`x-internal-token`,
 * plan 86, step 8.1). content-service caches it for ten minutes per language and locale, so
 * this reads it on every explanation rather than keep a copy of its own.
 */
export class HttpSoundBaseReader implements ISoundBaseReader {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs = 3_000,
  ) {}

  async base(language: string, locale: string): Promise<SoundBaseEntry[]> {
    const url = new URL('/api/v1/internal/sound-atoms', this.baseUrl);
    url.searchParams.set('language', language);
    url.searchParams.set('locale', locale);
    const res = await fetch(url, {
      headers: { 'x-internal-token': this.token, accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`${url.host} answered ${res.status} to ${url.pathname}`);
    const body = (await res.json()) as { atoms?: CatalogueAtom[] };
    return (body.atoms ?? []).map((atom) => ({
      family: atom.family,
      locale: atom.locale,
      title: atom.title,
      description: atom.description,
      howTo: atom.howTo,
      commonError: atom.commonError,
      ukNote: atom.ukNote,
      drill: atom.drill,
      carrierWords: atom.carrierWords ?? [],
    }));
  }
}
