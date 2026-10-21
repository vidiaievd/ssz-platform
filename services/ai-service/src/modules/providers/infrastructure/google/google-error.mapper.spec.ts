import { ApiError } from '@google/genai';
import { LlmError } from '../../domain/llm-error.js';
import { toLlmError } from './google-error.mapper.js';

/** What the SDK throws: the response body, as JSON, in the message. */
const apiError = (status: number, error: Record<string, unknown> = {}) =>
  new ApiError({ status, message: JSON.stringify({ error: { code: status, message: `status ${status}`, ...error } }) });

describe('toLlmError (Google)', () => {
  it.each([
    [400, 'invalid_request', false],
    [401, 'auth', false],
    [403, 'auth', false],
    [404, 'invalid_request', false],
    [429, 'rate_limited', true],
    [500, 'unavailable', true],
    [503, 'overloaded', true],
    [504, 'timeout', true],
  ] as const)('HTTP %i → %s (retryable=%s)', (status, code, retryable) => {
    const err = toLlmError(apiError(status));
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
  });

  it('a bad key is a 400 from Google, and still auth', () => {
    const err = toLlmError(
      apiError(400, {
        status: 'INVALID_ARGUMENT',
        message: 'API key not valid. Please pass a valid API key.',
        details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID' }],
      }),
    );
    expect(err.code).toBe('auth');
    expect(err.message).toBe('Google 400: API key not valid. Please pass a valid API key.');
  });

  it('FAILED_PRECONDITION (region, billing) is an account problem — auth, not retryable', () => {
    const err = toLlmError(apiError(400, { status: 'FAILED_PRECONDITION', message: 'User location is not supported' }));
    expect(err.code).toBe('auth');
    expect(err.retryable).toBe(false);
  });

  it('reads RetryInfo.retryDelay on a 429', () => {
    const err = toLlmError(
      apiError(429, { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '1.5s' }] }),
    );
    expect(err.retryAfterMs).toBe(1500);
    expect(toLlmError(apiError(429)).retryAfterMs).toBeUndefined();
  });

  it('the SDK timeout (an aborted fetch) is a timeout', () => {
    const abort = new Error('This operation was aborted');
    abort.name = 'AbortError';
    expect(toLlmError(abort).code).toBe('timeout');
  });

  it('a failed fetch is retryable unavailability', () => {
    const err = toLlmError(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
    expect(err.code).toBe('unavailable');
    expect(err.retryable).toBe(true);
    expect(err.message).toContain('ECONNREFUSED');
  });

  it('an LlmError passes through; anything else is unknown', () => {
    const own = new LlmError('auth', 'not configured');
    expect(toLlmError(own)).toBe(own);
    expect(toLlmError('boom').code).toBe('unknown');
  });
});
