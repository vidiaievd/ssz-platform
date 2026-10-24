import type { DraftWriteMeta, ReviewSubjectResult } from '../../review-draft/application/ports/review-attempts.client.js';
import type {
  GiveUpReason,
  IDirectReviewAttemptsClient,
  ReviewToWrite,
} from '../application/ports/direct-review-attempts.client.js';

/**
 * exercise-engine's internal routes for a learner's review (`x-internal-token`). Every path
 * carries the `/api/v1` prefix — without it the engine answers 404, which reads as "no such attempt".
 */
export class HttpDirectReviewAttemptsClient implements IDirectReviewAttemptsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async getSubject(attemptId: string): Promise<ReviewSubjectResult | null> {
    const url = new URL(`/api/v1/internal/attempts/${attemptId}/ai-review-subject`, this.baseUrl);
    url.searchParams.set('capability', 'review_direct');
    const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(this.timeoutMs) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`exercise-engine answered ${res.status} for the review subject of ${attemptId}`);
    return (await res.json()) as ReviewSubjectResult;
  }

  async putReview(
    attemptId: string,
    review: ReviewToWrite,
    meta: DraftWriteMeta,
  ): Promise<{ written: true; attemptStatus: string } | { written: false; code: string }> {
    const body =
      review.status === 'ready'
        ? { status: 'ready', items: review.items, summary: review.summary, marks: review.marks, verdict: review.verdict, ...meta }
        : { status: 'failed', items: [], errorCode: review.errorCode, ...meta };
    const res = await this.put(`/api/v1/internal/attempts/${attemptId}/ai-review`, body);
    if (res.ok) {
      const answer = (await res.json()) as { attempt?: { status?: unknown } };
      return { written: true, attemptStatus: typeof answer.attempt?.status === 'string' ? answer.attempt.status : 'unknown' };
    }
    // 409 (another write landed first) and 503 (content-service down) are worth the retry a throw brings.
    if (res.status === 404 || res.status === 422) return { written: false, code: await refusalCode(res) };
    throw new Error(`exercise-engine answered ${res.status} to the review of ${attemptId}`);
  }

  async giveUp(
    attemptId: string,
    reason: GiveUpReason,
    aiCallId: string | null,
  ): Promise<{ closed: true } | { closed: false; code: string }> {
    const res = await this.put(`/api/v1/internal/attempts/${attemptId}/no-reviewer`, { reason, aiCallId });
    if (res.ok) return { closed: true };
    if (res.status === 404 || res.status === 422) return { closed: false, code: await refusalCode(res) };
    throw new Error(`exercise-engine answered ${res.status} to giving up on ${attemptId}`);
  }

  private put(path: string, body: unknown): Promise<Response> {
    return fetch(new URL(path, this.baseUrl), {
      method: 'PUT',
      headers: { ...this.headers(), 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private headers(): Record<string, string> {
    return { 'x-internal-token': this.internalToken, accept: 'application/json' };
  }
}

async function refusalCode(res: Response): Promise<string> {
  const answer = (await res.json().catch(() => ({}))) as { code?: unknown };
  return typeof answer.code === 'string' ? answer.code : `HTTP_${res.status}`;
}
