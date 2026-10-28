import type { IReadingCasesClient } from '../application/ports/reading-cases.client.js';
import type { PromptCheck, ReadingCaseSet } from '../domain/reading-case.js';

/** The set reads every exercise of it from content-service: slower than one attempt. */
const CASES_TIMEOUT_MS = 30_000;

/**
 * exercise-engine's internal routes for the shadow run (`x-internal-token`). Every path carries
 * the `/api/v1` prefix — without it the engine answers 404.
 */
export class HttpReadingCasesClient implements IReadingCasesClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async listCases(limit: number): Promise<ReadingCaseSet> {
    const url = new URL('/api/v1/internal/ai-review-cases', this.baseUrl);
    url.searchParams.set('capability', 'voice_review');
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(CASES_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`exercise-engine answered ${res.status} for the reading cases`);
    return (await res.json()) as ReadingCaseSet;
  }

  async check(
    language: string,
    passPercent: number,
    prompts: Array<{ itemId: string; text: string; transcript: string }>,
  ): Promise<PromptCheck[]> {
    const res = await fetch(new URL('/api/v1/internal/reading-checks', this.baseUrl), {
      method: 'POST',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify({ language, passPercent, prompts }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`exercise-engine answered ${res.status} to the reading check`);
    return ((await res.json()) as { prompts: PromptCheck[] }).prompts;
  }

  private headers(): Record<string, string> {
    return { 'x-internal-token': this.internalToken, accept: 'application/json' };
  }
}
