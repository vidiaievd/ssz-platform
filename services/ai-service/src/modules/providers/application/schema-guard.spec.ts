import { LlmError } from '../domain/llm-error.js';
import type { LlmRequest } from '../domain/llm-request.js';
import type { LlmOutput, LlmResult, LlmStopReason } from '../domain/llm-result.js';
import { SchemaGuard } from './schema-guard.js';

const schema = {
  type: 'object',
  required: ['verdict', 'score'],
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['correct', 'incorrect'] },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    note: { type: 'string' },
  },
};

function request(withSchema = true): LlmRequest {
  return {
    system: 'judge',
    messages: [{ role: 'user', parts: [{ type: 'text', text: 'hi' }] }],
    responseSchema: withSchema ? { name: 'verdict', schema } : undefined,
    maxOutputTokens: 100,
    timeoutMs: 1000,
  };
}

function result(output: LlmOutput, stop: LlmStopReason = 'end'): LlmResult {
  return {
    output,
    stop,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
    providerRequestId: 'r1',
    latencyMs: 1,
  };
}

function expectInvalid(outcome: ReturnType<SchemaGuard['check']>, fragment: string): void {
  expect(outcome.isFail).toBe(true);
  expect(outcome.error).toBeInstanceOf(LlmError);
  expect(outcome.error.code).toBe('invalid_response');
  expect(outcome.error.retryable).toBe(false);
  expect(outcome.error.message).toContain(fragment);
}

describe('SchemaGuard', () => {
  const guard = new SchemaGuard();

  it('accepts a structured answer that matches the schema', () => {
    const outcome = guard.check(result({ kind: 'structured', data: { verdict: 'correct', score: 90 } }), request());
    expect(outcome.isOk).toBe(true);
    expect(outcome.value.output).toEqual({ kind: 'structured', data: { verdict: 'correct', score: 90 } });
  });

  it('parses a JSON text answer (json_mode / none) into structured', () => {
    const outcome = guard.check(result({ kind: 'text', text: '{"verdict":"incorrect","score":0}' }), request());
    expect(outcome.isOk).toBe(true);
    expect(outcome.value.output).toEqual({ kind: 'structured', data: { verdict: 'incorrect', score: 0 } });
  });

  it('rejects a missing required property', () => {
    expectInvalid(guard.check(result({ kind: 'structured', data: { verdict: 'correct' } }), request()), 'score');
  });

  it('never coerces types — "90" is not an integer', () => {
    expectInvalid(
      guard.check(result({ kind: 'structured', data: { verdict: 'correct', score: '90' } }), request()),
      'integer',
    );
  });

  it('rejects an extra property instead of stripping it', () => {
    expectInvalid(
      guard.check(result({ kind: 'structured', data: { verdict: 'correct', score: 1, extra: 1 } }), request()),
      'additional',
    );
  });

  it('rejects a value outside the enum', () => {
    expectInvalid(
      guard.check(result({ kind: 'structured', data: { verdict: 'maybe', score: 1 } }), request()),
      'allowed values',
    );
  });

  it('rejects text that is not JSON', () => {
    expectInvalid(guard.check(result({ kind: 'text', text: 'Sure! Here you go.' }), request()), 'not valid JSON');
  });

  it('names truncation when the answer hit the output limit', () => {
    expectInvalid(guard.check(result({ kind: 'text', text: '{"verdict":"corr' }, 'length'), request()), 'truncated');
  });

  it('turns a refusal into `filtered`, not `invalid_response`', () => {
    const outcome = guard.check(result({ kind: 'text', text: 'No.' }, 'refusal'), request());
    expect(outcome.isFail).toBe(true);
    expect(outcome.error.code).toBe('filtered');
  });

  it('passes tool calls through untouched — the schema is for the final answer', () => {
    const toolResult = result({ kind: 'tool_calls', calls: [{ id: 'c1', name: 'lookup', input: {} }] }, 'tool');
    const outcome = guard.check(toolResult, request());
    expect(outcome.isOk).toBe(true);
    expect(outcome.value).toBe(toolResult);
  });

  it('passes a text answer through when no schema was asked for', () => {
    const textResult = result({ kind: 'text', text: 'plain' });
    expect(guard.check(textResult, request(false)).value).toBe(textResult);
  });

  it('throws — not invalid_response — when our own schema does not compile', () => {
    const broken: LlmRequest = { ...request(), responseSchema: { name: 'broken', schema: { type: 'nope' } } };
    expect(() => guard.check(result({ kind: 'structured', data: {} }), broken)).toThrow('broken');
  });

  it('reuses the compiled validator for the same schema object', () => {
    const local = new SchemaGuard();
    const compile = jest.spyOn((local as any).ajv, 'compile');
    const req = request();
    local.check(result({ kind: 'structured', data: { verdict: 'correct', score: 1 } }), req);
    local.check(result({ kind: 'structured', data: { verdict: 'correct', score: 2 } }), req);
    expect(compile).toHaveBeenCalledTimes(1);
  });
});
