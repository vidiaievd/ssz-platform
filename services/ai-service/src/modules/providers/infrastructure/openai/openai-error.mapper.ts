import OpenAI from 'openai';
import { LlmError } from '../../domain/llm-error.js';

/**
 * SDK exception → `LlmError`, for OpenAI, Azure and compatible servers alike — they all
 * come back through the same SDK classes. `label` names the provider in the message.
 *
 * Order matters: a timeout is a connection error, and every HTTP error is an `APIError`,
 * so the most specific check comes first.
 */
export function toLlmError(err: unknown, label: string): LlmError {
  if (err instanceof LlmError) return err;

  if (err instanceof OpenAI.APIConnectionTimeoutError) {
    return new LlmError('timeout', `${label}: request timed out`, { cause: err });
  }
  if (err instanceof OpenAI.APIUserAbortError) {
    return new LlmError('unknown', `${label}: request aborted`, { cause: err });
  }
  if (err instanceof OpenAI.APIConnectionError) {
    return new LlmError('unavailable', `${label}: connection failed — ${err.message}`, { cause: err });
  }
  if (err instanceof OpenAI.AuthenticationError || err instanceof OpenAI.PermissionDeniedError) {
    return new LlmError('auth', `${label}: ${err.message}`, { cause: err });
  }
  if (err instanceof OpenAI.RateLimitError) {
    // Out of credit is a 429 too, but waiting will not fix it: an account problem, as final
    // as a bad key.
    if (err.code === 'insufficient_quota') return new LlmError('auth', `${label}: ${err.message}`, { cause: err });
    return new LlmError('rate_limited', `${label}: ${err.message}`, { cause: err, retryAfterMs: retryAfterMs(err.headers) });
  }
  if (err instanceof OpenAI.APIError) {
    const status = err.status ?? 0;
    const message = `${label} ${status}: ${err.message}`;
    // Azure rejects a prompt its content filter flags with a 400 rather than a finish reason.
    if (err.code === 'content_filter') return new LlmError('filtered', message, { cause: err });
    if (status === 402) return new LlmError('auth', message, { cause: err });
    if (status === 503) return new LlmError('overloaded', message, { cause: err, retryAfterMs: retryAfterMs(err.headers) });
    if ([400, 404, 413, 422].includes(status)) return new LlmError('invalid_request', message, { cause: err });
    if (status === 408 || status === 409 || status >= 500) return new LlmError('unavailable', message, { cause: err });
    return new LlmError('unknown', message, { cause: err });
  }

  return new LlmError('unknown', `${label}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const ms = Number(headers?.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const seconds = Number(headers?.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
