import Anthropic from '@anthropic-ai/sdk';
import { LlmError } from '../../domain/llm-error.js';

/**
 * SDK exception → `LlmError`. Order matters: the SDK's classes inherit from each other
 * (a timeout is a connection error, every HTTP error is an `APIError`), so the most
 * specific check comes first.
 */
export function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;

  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError('timeout', 'Anthropic: request timed out', { cause: err });
  }
  if (err instanceof Anthropic.APIUserAbortError) {
    return new LlmError('unknown', 'Anthropic: request aborted', { cause: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new LlmError('unavailable', `Anthropic: connection failed — ${err.message}`, { cause: err });
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new LlmError('auth', `Anthropic: ${err.message}`, { cause: err });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new LlmError('rate_limited', `Anthropic: ${err.message}`, {
      cause: err,
      retryAfterMs: retryAfterMs(err.headers),
    });
  }
  if (err instanceof Anthropic.APIError) {
    const status = err.status ?? 0;
    const message = `Anthropic ${status}: ${err.message}`;
    if (status === 529) return new LlmError('overloaded', message, { cause: err, retryAfterMs: retryAfterMs(err.headers) });
    // Billing: an account problem, the same class of failure as a bad key.
    if (status === 402) return new LlmError('auth', message, { cause: err });
    if ([400, 404, 413, 422].includes(status)) return new LlmError('invalid_request', message, { cause: err });
    if (status === 408 || status === 409 || status >= 500) return new LlmError('unavailable', message, { cause: err });
    return new LlmError('unknown', message, { cause: err });
  }

  return new LlmError('unknown', `Anthropic: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const ms = Number(headers?.get('retry-after-ms'));
  if (Number.isFinite(ms) && ms > 0) return ms;
  const seconds = Number(headers?.get('retry-after'));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
