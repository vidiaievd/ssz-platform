import type { ISchoolLanguageReader } from '../application/ports/school-language.reader.js';

/** `GET /api/v1/internal/schools/:id/explanation-language` of organization-service (`x-internal-token`). */
export class HttpSchoolLanguageReader implements ISchoolLanguageReader {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 3_000,
  ) {}

  async explanationLanguage(schoolId: string): Promise<string | null> {
    const url = new URL(`/api/v1/internal/schools/${schoolId}/explanation-language`, this.baseUrl);
    const res = await fetch(url, {
      headers: { 'x-internal-token': this.internalToken, accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`organization-service answered ${res.status} for school ${schoolId}`);
    const body = (await res.json()) as { language?: unknown };
    return typeof body.language === 'string' && body.language !== '' ? body.language : null;
  }
}
