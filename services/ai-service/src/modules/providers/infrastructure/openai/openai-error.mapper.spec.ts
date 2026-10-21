import OpenAI from 'openai';
import { LlmError } from '../../domain/llm-error.js';
import { toLlmError } from './openai-error.mapper.js';

const httpError = (status: number, code: string | null = null, headers: Record<string, string> = {}) =>
  OpenAI.APIError.generate(
    status,
    { error: { message: `status ${status}`, type: 'x', code } },
    undefined,
    new Headers(headers),
  );

describe('toLlmError (OpenAI family)', () => {
  it.each([
    [400, 'invalid_request', false],
    [401, 'auth', false],
    [402, 'auth', false],
    [403, 'auth', false],
    [404, 'invalid_request', false],
    [413, 'invalid_request', false],
    [422, 'invalid_request', false],
    [429, 'rate_limited', true],
    [500, 'unavailable', true],
    [503, 'overloaded', true],
  ] as const)('HTTP %i → %s (retryable=%s)', (status, code, retryable) => {
    const err = toLlmError(httpError(status), 'OpenAI');
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
  });

  it('out of credit is a 429 that no wait will fix — auth', () => {
    const err = toLlmError(httpError(429, 'insufficient_quota'), 'OpenAI');
    expect(err.code).toBe('auth');
    expect(err.retryable).toBe(false);
  });

  it("Azure's content filter rejection is filtered, not a bad request", () => {
    expect(toLlmError(httpError(400, 'content_filter'), 'Azure OpenAI').code).toBe('filtered');
  });

  it('reads retry-after (seconds) and retry-after-ms', () => {
    expect(toLlmError(httpError(429, null, { 'retry-after': '3' }), 'OpenAI').retryAfterMs).toBe(3000);
    expect(toLlmError(httpError(429, null, { 'retry-after-ms': '250' }), 'OpenAI').retryAfterMs).toBe(250);
    expect(toLlmError(httpError(429), 'OpenAI').retryAfterMs).toBeUndefined();
  });

  it('a timeout is a timeout, not a connection failure', () => {
    expect(toLlmError(new OpenAI.APIConnectionTimeoutError(), 'OpenAI').code).toBe('timeout');
  });

  it('a connection failure is retryable unavailability, named after the provider', () => {
    const err = toLlmError(new OpenAI.APIConnectionError({ message: 'ECONNREFUSED' }), 'OpenAI-compatible');
    expect(err.code).toBe('unavailable');
    expect(err.retryable).toBe(true);
    expect(err.message).toMatch(/^OpenAI-compatible: /);
  });

  it('passes an LlmError through and calls anything else unknown', () => {
    const own = new LlmError('auth', 'not configured');
    expect(toLlmError(own, 'OpenAI')).toBe(own);
    expect(toLlmError(new Error('boom'), 'OpenAI').code).toBe('unknown');
  });
});
