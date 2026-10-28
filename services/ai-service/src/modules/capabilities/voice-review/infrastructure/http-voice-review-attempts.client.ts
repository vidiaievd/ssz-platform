import type { DraftWriteMeta } from '../../review-draft/application/ports/review-attempts.client.js';
import type { GiveUpReason } from '../../review-direct/application/ports/direct-review-attempts.client.js';
import type { IVoiceReviewAttemptsClient, ReadingToWrite } from '../application/ports/voice-review-attempts.client.js';
import type { VoiceSubjectResult } from '../domain/read-aloud-subject.js';

/**
 * exercise-engine's internal routes for a voice review (`x-internal-token`). Every path carries
 * the `/api/v1` prefix — without it the engine answers 404, which reads as "no such attempt".
 */
export class HttpVoiceReviewAttemptsClient implements IVoiceReviewAttemptsClient {
  constructor(
    private readonly baseUrl: string,
    private readonly internalToken: string,
    private readonly timeoutMs = 5_000,
  ) {}

  async getSubject(attemptId: string): Promise<VoiceSubjectResult | null> {
    const url = new URL(`/api/v1/internal/attempts/${attemptId}/ai-review-subject`, this.baseUrl);
    url.searchParams.set('capability', 'voice_review');
    const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(this.timeoutMs) });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`exercise-engine answered ${res.status} for the voice review subject of ${attemptId}`);
    return (await res.json()) as VoiceSubjectResult;
  }

  async putReading(
    attemptId: string,
    reading: ReadingToWrite,
    meta: DraftWriteMeta,
  ): Promise<{ written: true; attemptStatus: string; provisional: boolean } | { written: false; code: string }> {
    // No remarks: the engine reads the verdict off what was heard (step 7), the panel draws the words.
    const body =
      reading.status === 'ready'
        ? { status: 'ready', items: [], summary: null, marks: null, reading: { prompts: reading.prompts }, ...meta }
        : { status: 'failed', items: [], errorCode: reading.errorCode, ...meta };
    const res = await this.put(`/api/v1/internal/attempts/${attemptId}/ai-review`, body);
    if (res.ok) {
      const answer = (await res.json()) as { attempt?: { status?: unknown; provisional?: unknown } };
      return {
        written: true,
        attemptStatus: typeof answer.attempt?.status === 'string' ? answer.attempt.status : 'unknown',
        provisional: answer.attempt?.provisional === true,
      };
    }
    // 409 (another write landed first) and 503 (content-service down) are worth the retry a throw brings.
    if (res.status === 404 || res.status === 422) return { written: false, code: await refusalCode(res) };
    throw new Error(`exercise-engine answered ${res.status} to the reading of ${attemptId}`);
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
