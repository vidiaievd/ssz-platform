import { ApiError } from '@google/genai';
import { LlmError } from '../../domain/llm-error.js';

/**
 * SDK exception → `LlmError`.
 *
 * The SDK has one error class for every HTTP failure; its message is the response body as
 * JSON, so the details Google puts there (`API_KEY_INVALID`, `RetryInfo`) are read from it.
 * Network failures and the SDK's own timeout surface as plain `fetch` errors.
 */
export function toLlmError(err: unknown): LlmError {
  if (err instanceof LlmError) return err;

  if (err instanceof ApiError) {
    const status = err.status;
    const body = parseBody(err.message);
    const message = `Google ${status}: ${body?.error?.message ?? err.message}`;
    // A bad key is a 400 here, not a 401.
    if (status === 401 || status === 403 || hasReason(body, 'API_KEY_INVALID')) {
      return new LlmError('auth', message, { cause: err });
    }
    // Free tier not offered in this region, billing not set up: the account cannot use the
    // provider at all — the same class of failure as a bad key, and just as final.
    if (status === 400 && body?.error?.status === 'FAILED_PRECONDITION') {
      return new LlmError('auth', message, { cause: err });
    }
    if (status === 429) return new LlmError('rate_limited', message, { cause: err, retryAfterMs: retryDelayMs(body) });
    if (status === 503) return new LlmError('overloaded', message, { cause: err });
    if (status === 504) return new LlmError('timeout', message, { cause: err });
    if ([400, 404, 413, 422].includes(status)) return new LlmError('invalid_request', message, { cause: err });
    if (status === 408 || status === 409 || status >= 500) return new LlmError('unavailable', message, { cause: err });
    return new LlmError('unknown', message, { cause: err });
  }

  if (err instanceof Error) {
    // The SDK enforces `httpOptions.timeout` by aborting the fetch; nothing else here aborts.
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return new LlmError('timeout', 'Google: request timed out', { cause: err });
    }
    if (err instanceof TypeError && /fetch failed/i.test(err.message)) {
      const detail = (err.cause as { code?: string } | undefined)?.code ?? err.message;
      return new LlmError('unavailable', `Google: connection failed — ${detail}`, { cause: err });
    }
  }

  return new LlmError('unknown', `Google: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
}

interface ErrorBody {
  error?: {
    message?: string;
    status?: string;
    details?: Array<{ '@type'?: string; reason?: string; retryDelay?: string }>;
  };
}

function parseBody(message: string): ErrorBody | undefined {
  try {
    const parsed: unknown = JSON.parse(message);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ErrorBody) : undefined;
  } catch {
    return undefined;
  }
}

function hasReason(body: ErrorBody | undefined, reason: string): boolean {
  return body?.error?.details?.some((d) => d.reason === reason) ?? false;
}

/** `RetryInfo.retryDelay` is a protobuf Duration: `"30s"`, `"1.5s"`. */
function retryDelayMs(body: ErrorBody | undefined): number | undefined {
  const delay = body?.error?.details?.find((d) => d['@type']?.endsWith('RetryInfo'))?.retryDelay;
  const seconds = delay ? Number.parseFloat(delay) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : undefined;
}
