import type { ILearnerLanguageReader } from '../application/ports/learner-language.reader.js';

/**
 * `GET /api/v1/internal/profiles/:userId` of user-profile-service. Its guard reads
 * `x-service-token`, not the `x-internal-token` the other services use — the wrong one is a 401.
 */
export class HttpLearnerLanguageReader implements ILearnerLanguageReader {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 3_000,
  ) {}

  async interfaceLanguage(userId: string): Promise<string | null> {
    const url = new URL(`/api/v1/internal/profiles/${userId}`, this.baseUrl);
    const res = await fetch(url, {
      headers: { 'x-service-token': this.internalToken, accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`user-profile-service answered ${res.status} for user ${userId}`);
    const body = (await res.json()) as { uiLocale?: unknown };
    return typeof body.uiLocale === 'string' && body.uiLocale !== '' ? body.uiLocale : null;
  }
}
