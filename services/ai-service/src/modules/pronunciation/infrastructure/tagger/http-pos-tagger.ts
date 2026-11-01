import type { IPosTagger } from '../../application/ports/pos-tagger.js';
import type { PosToken } from '../../domain/narrow-variants.js';

/** Course languages the sidecar carries a spaCy model for (`TAGGER_MODELS` in `server.py`). */
const TAGGED_LANGUAGES: ReadonlySet<string> = new Set(['nb']);

/**
 * The whisper sidecar's `POST /v1/tag?language=` (`infrastructure/whisper/server.py`), the passage
 * as `{ text }`. Keyless, on the platform network like `/v1/transcribe`. A 404 means the image
 * carries no tagger for the language — an error like any other here; the caller goes without.
 */
export class HttpPosTagger implements IPosTagger {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 2_000,
  ) {}

  async tag(language: string, text: string): Promise<PosToken[]> {
    if (!TAGGED_LANGUAGES.has(language) || !text.trim()) return [];
    const url = new URL('v1/tag', this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    url.searchParams.set('language', language);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`Tagger answered ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    const body = (await res.json()) as { tokens?: unknown };
    if (!Array.isArray(body.tokens)) throw new Error('Tagger answer has no tokens');
    return body.tokens as PosToken[];
  }
}
