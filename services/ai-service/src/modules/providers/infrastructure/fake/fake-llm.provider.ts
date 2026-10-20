import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LlmError } from '../../domain/llm-error.js';
import type { LlmProvider } from '../../domain/llm-provider.port.js';
import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmChunk, LlmOutput, LlmResult, LlmStopReason } from '../../domain/llm-result.js';
import type { LlmModelRef } from '../../domain/model-features.js';
import { sampleFromSchema } from './schema-sample.js';

export const FAKE_SCENARIOS = [
  'ok',
  'tool_call',
  'invalid_schema',
  'not_json',
  'truncated',
  'refusal',
  'timeout',
  'rate_limited',
  'overloaded',
  'auth',
  'invalid_request',
  'unavailable',
] as const;

export type FakeScenario = (typeof FAKE_SCENARIOS)[number];

const MARKER = /@fake:([a-z_]+)/;

/**
 * A provider that never leaves the process — for unit tests and for dev without API keys.
 *
 * The scenario comes from two places, the request winning:
 *  - a `@fake:<scenario>` marker anywhere in the system prompt or a message;
 *  - the model id, `fake-<scenario>` (e.g. `fake-rate-limited`), so two fake models under
 *    one binding can fail differently on the same request — what the router tests need.
 * Neither present → `ok`. An unknown marker is a test typo and fails loudly; a model id
 * whose suffix is not a scenario (`fake-small`) simply answers.
 *
 * Errors are thrown at once: `timeout` reports a timeout without waiting for one.
 */
@Injectable()
export class FakeLlmProvider implements LlmProvider {
  readonly kind = 'fake' as const;

  async complete(request: LlmRequest, model: LlmModelRef): Promise<LlmResult> {
    const started = Date.now();
    const scenario = this.scenarioOf(request, model);
    this.throwIfFailure(scenario);

    const { output, stop } = this.answer(scenario, request);
    return {
      output,
      stop,
      usage: {
        input: estimateTokens(promptText(request)),
        output: estimateTokens(outputText(output)),
        cacheRead: 0,
        cacheWrite: 0,
      },
      providerRequestId: `fake_${randomUUID()}`,
      latencyMs: Date.now() - started,
    };
  }

  async *stream(request: LlmRequest, model: LlmModelRef): AsyncIterable<LlmChunk> {
    const result = await this.complete(request, model);
    const { output } = result;
    if (output.kind === 'tool_calls') {
      for (const call of output.calls) yield { type: 'tool_call', call };
    } else {
      const text = outputText(output);
      for (let i = 0; i < text.length; i += 16) yield { type: 'text_delta', text: text.slice(i, i + 16) };
    }
    yield { type: 'done', result };
  }

  private scenarioOf(request: LlmRequest, model: LlmModelRef): FakeScenario {
    const texts = [request.system, ...request.messages.flatMap((m) => m.parts.map((p) => p.text))];
    const fromRequest = texts.map((t) => MARKER.exec(t)?.[1]).find(Boolean);
    if (fromRequest) {
      if (!isScenario(fromRequest)) throw new Error(`Unknown fake scenario "${fromRequest}"`);
      return fromRequest;
    }

    // A model id only picks a scenario when its suffix names one — `fake-small` is just a
    // fake model that answers.
    const suffix = model.providerModelId.replace(/^fake-/, '').replace(/-/g, '_');
    return isScenario(suffix) ? suffix : 'ok';
  }

  private throwIfFailure(scenario: FakeScenario): void {
    switch (scenario) {
      case 'timeout':
        throw new LlmError('timeout', 'fake: request timed out');
      case 'rate_limited':
        throw new LlmError('rate_limited', 'fake: rate limited', { retryAfterMs: 1000 });
      case 'overloaded':
        throw new LlmError('overloaded', 'fake: overloaded');
      case 'auth':
        throw new LlmError('auth', 'fake: invalid credentials');
      case 'invalid_request':
        throw new LlmError('invalid_request', 'fake: invalid request');
      case 'unavailable':
        throw new LlmError('unavailable', 'fake: provider unavailable');
      default:
        return;
    }
  }

  private answer(scenario: FakeScenario, request: LlmRequest): { output: LlmOutput; stop: LlmStopReason } {
    const schema = request.responseSchema?.schema;
    switch (scenario) {
      case 'tool_call': {
        const tool = request.tools?.[0];
        if (!tool) throw new Error('fake scenario "tool_call" needs at least one tool in the request');
        return {
          output: {
            kind: 'tool_calls',
            calls: [{ id: `fake_call_${randomUUID()}`, name: tool.name, input: sampleFromSchema(tool.inputSchema) }],
          },
          stop: 'tool',
        };
      }
      case 'invalid_schema':
        // Valid JSON, wrong shape: the case `native` providers are not supposed to produce.
        return { output: { kind: 'structured', data: { unexpected: true } }, stop: 'end' };
      case 'not_json':
        return { output: { kind: 'text', text: 'Sure! Here is the answer you asked for.' }, stop: 'end' };
      case 'truncated':
        return { output: { kind: 'text', text: '{"items": [{"text": "cut off' }, stop: 'length' };
      case 'refusal':
        return { output: { kind: 'text', text: 'I can not help with that.' }, stop: 'refusal' };
      default:
        if (schema) return { output: { kind: 'structured', data: sampleFromSchema(schema) }, stop: 'end' };
        return { output: { kind: 'text', text: `fake: ${lastUserText(request)}` }, stop: 'end' };
    }
  }
}

function isScenario(value: string): value is FakeScenario {
  return (FAKE_SCENARIOS as readonly string[]).includes(value);
}

function promptText(request: LlmRequest): string {
  return [request.system, ...request.messages.flatMap((m) => m.parts.map((p) => p.text))].join('\n');
}

function lastUserText(request: LlmRequest): string {
  const last = [...request.messages].reverse().find((m) => m.role === 'user');
  return last?.parts.map((p) => p.text).join(' ') ?? '';
}

function outputText(output: LlmOutput): string {
  switch (output.kind) {
    case 'text':
      return output.text;
    case 'structured':
      return JSON.stringify(output.data);
    case 'tool_calls':
      return JSON.stringify(output.calls);
  }
}

/** Roughly four characters per token — the order of magnitude, which is all a fake owes. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
