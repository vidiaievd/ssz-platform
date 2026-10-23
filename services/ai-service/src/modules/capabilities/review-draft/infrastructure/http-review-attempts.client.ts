import type {
  DraftToWrite,
  DraftWriteMeta,
  IReviewAttemptsClient,
  ReviewSubjectResult,
} from '../application/ports/review-attempts.client.js';
import type { ReviewCaseSet } from '../eval/domain/review-case.js';

/** Reading the set reads an exercise per case from content-service: more than one call's worth of time. */
const CASES_TIMEOUT_MS = 30_000;

/**
 * exercise-engine's internal routes for drafts (`x-internal-token`). Every path carries the
 * `/api/v1` prefix — without it the engine answers 404, which reads as "no such attempt".
 */
export class HttpReviewAttemptsClient implements IReviewAttemptsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async getSubject(attemptId: string): Promise<ReviewSubjectResult | null> {
    const url = new URL(`/api/v1/internal/attempts/${attemptId}/ai-review-subject`, this.baseUrl);
    url.searchParams.set('capability', 'review_draft');
    const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(this.timeoutMs) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`exercise-engine answered ${res.status} for the review subject of ${attemptId}`);
    return (await res.json()) as ReviewSubjectResult;
  }

  async putDraft(
    attemptId: string,
    draft: DraftToWrite,
    meta: DraftWriteMeta,
  ): Promise<{ written: true } | { written: false; code: string }> {
    const body =
      draft.status === 'ready'
        ? { capability: 'review_draft', status: 'ready', items: draft.items, summary: draft.summary, marks: draft.marks, ...meta }
        : { capability: 'review_draft', status: 'failed', items: [], errorCode: draft.errorCode, ...meta };
    const res = await fetch(new URL(`/api/v1/internal/attempts/${attemptId}/ai-draft`, this.baseUrl), {
      method: 'PUT',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (res.ok) return { written: true };
    if (res.status === 404 || res.status === 422) {
      const answer = (await res.json().catch(() => ({}))) as { code?: unknown };
      return { written: false, code: typeof answer.code === 'string' ? answer.code : `http_${res.status}` };
    }
    throw new Error(`exercise-engine answered ${res.status} to the draft of ${attemptId}`);
  }

  async listCases(limit: number): Promise<ReviewCaseSet> {
    const url = new URL('/api/v1/internal/ai-review-cases', this.baseUrl);
    url.searchParams.set('capability', 'review_draft');
    url.searchParams.set('limit', String(limit));
    const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(CASES_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`exercise-engine answered ${res.status} for the review cases`);
    return (await res.json()) as ReviewCaseSet;
  }

  private headers(): Record<string, string> {
    return { 'x-internal-token': this.internalToken, accept: 'application/json' };
  }
}
