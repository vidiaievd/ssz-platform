import { LlmError } from '../../domain/llm-error.js';

/**
 * Azure AI Speech failures as `LlmError`s — shared by recognition and synthesis (plan 88,
 * step 6b), which answer from different hosts with the same status codes. `label` names the
 * call in the message (`Azure Speech`, `Azure TTS`).
 */

/** The call never got an answer: our timeout, or the endpoint is unreachable. */
export function fromFetchFailure(err: unknown, label = 'Azure Speech'): LlmError {
  // Not `instanceof Error`: the timeout is a DOMException, which may come from another realm.
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return new LlmError('timeout', `${label}: request timed out`, { cause: err });
  }
  const detail = err instanceof Error ? (err.cause instanceof Error ? err.cause.message : err.message) : String(err);
  return new LlmError('unavailable', `${label}: connection failed — ${detail}`, { cause: err });
}

export async function fromStatus(response: Response, label = 'Azure Speech'): Promise<LlmError> {
  const status = response.status;
  const detail = await response.text().catch(() => '');
  const message = `${label} ${status}: ${detail.slice(0, 300)}`;
  if (status === 401 || status === 403) return new LlmError('auth', message);
  if (status === 429) return new LlmError('rate_limited', message, { retryAfterMs: retryAfterMs(response.headers) });
  if (status === 408) return new LlmError('timeout', message);
  if ([400, 413, 415, 422].includes(status)) return new LlmError('invalid_request', message);
  if (status >= 500) return new LlmError('unavailable', message);
  return new LlmError('unknown', message);
}

function retryAfterMs(headers: Headers): number | undefined {
  const seconds = Number(headers.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
