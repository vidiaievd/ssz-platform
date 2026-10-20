import Anthropic from '@anthropic-ai/sdk';
import { LlmError } from '../../domain/llm-error.js';
import { toLlmError } from './anthropic-error.mapper.js';

const httpError = (status: number, headers: Record<string, string> = {}) =>
  Anthropic.APIError.generate(status, { error: { type: 'x', message: `status ${status}` } }, undefined, new Headers(headers));

describe('toLlmError (Anthropic)', () => {
  it.each([
    [400, 'invalid_request', false],
    [401, 'auth', false],
    [402, 'auth', false],
    [403, 'auth', false],
    [404, 'invalid_request', false],
    [413, 'invalid_request', false],
    [429, 'rate_limited', true],
    [500, 'unavailable', true],
    [529, 'overloaded', true],
  ] as const)('HTTP %i → %s (retryable=%s)', (status, code, retryable) => {
    const err = toLlmError(httpError(status));
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe(code);
    expect(err.retryable).toBe(retryable);
  });

  it('reads retry-after (seconds) and retry-after-ms', () => {
    expect(toLlmError(httpError(429, { 'retry-after': '3' })).retryAfterMs).toBe(3000);
    expect(toLlmError(httpError(429, { 'retry-after-ms': '250' })).retryAfterMs).toBe(250);
    expect(toLlmError(httpError(429)).retryAfterMs).toBeUndefined();
  });

  it('a timeout is a timeout, not a connection failure', () => {
    expect(toLlmError(new Anthropic.APIConnectionTimeoutError()).code).toBe('timeout');
  });

  it('a connection failure is retryable unavailability', () => {
    const err = toLlmError(new Anthropic.APIConnectionError({ message: 'ECONNRESET' }));
    expect(err.code).toBe('unavailable');
    expect(err.retryable).toBe(true);
  });

  it('passes an LlmError through unchanged', () => {
    const original = new LlmError('auth', 'not configured');
    expect(toLlmError(original)).toBe(original);
  });

  it('anything else is unknown and not retried', () => {
    const err = toLlmError(new TypeError('boom'));
    expect(err.code).toBe('unknown');
    expect(err.retryable).toBe(false);
  });
});
