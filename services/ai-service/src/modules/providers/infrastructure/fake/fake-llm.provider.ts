import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Injectable } from '@nestjs/common';
import { LlmError } from '../../domain/llm-error.js';
import type { LlmProvider } from '../../domain/llm-provider.port.js';
import type { LlmMessage, LlmPart, LlmRequest } from '../../domain/llm-request.js';
import type { LlmChunk, LlmOutput, LlmResult, LlmStopReason } from '../../domain/llm-result.js';
import { toolTurnProblem } from '../../domain/llm-turns.js';
import type { LlmModelRef } from '../../domain/model-features.js';
import { sampleFromSchema } from './schema-sample.js';

export const FAKE_SCENARIOS = [
  'ok',
  'tool_call',
  'tool_then_answer',
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
  'slow',
] as const;

export type FakeScenario = (typeof FAKE_SCENARIOS)[number];

const MARKER = /@fake:([a-z_]+)/;

/** How long `slow` takes to answer — room to stop a dependency mid-call (plan 77, step 8a). */
const SLOW_MS = 8_000;

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
 * Errors are thrown at once: `timeout` reports a timeout without waiting for one. `slow`
 * is the one scenario that waits — SLOW_MS, then an ordinary answer (a timeout if the
 * request allows less).
 *
 * Tool turns (plan 83, step 4): `tool_call` calls the first tool on every round, so a loop
 * never ends on its own — what a round budget is tested with; `tool_then_answer` calls it
 * until the last message carries the results, then answers as `ok` does — the scripted
 * tool-then-answer sequence. Markers are read from text parts only, never from a tool's
 * result. Like a real provider, the fake refuses a history whose results do not pair with
 * the calls before them, and an own turn (`native`) replayed with its calls changed.
 */
@Injectable()
export class FakeLlmProvider implements LlmProvider {
  readonly kind = 'fake' as const;

  async complete(request: LlmRequest, model: LlmModelRef): Promise<LlmResult> {
    const started = Date.now();
    const scenario = this.scenarioOf(request, model);
    this.throwIfFailure(scenario);
    this.checkHistory(request, model);
    if (scenario === 'slow') await this.waitSlowly(request.timeoutMs);

    const { output, stop } = this.answer(scenario, request, model);
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
    const texts = [request.system, ...request.messages.flatMap(textsOf)];
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

  private checkHistory(request: LlmRequest, model: LlmModelRef): void {
    const problem = toolTurnProblem(request.messages);
    if (problem) throw new LlmError('invalid_request', `fake: ${problem}`);

    for (const message of request.messages) {
      const { native } = message;
      if (native?.provider !== this.kind || native.providerModelId !== model.providerModelId) continue;
      if (JSON.stringify((native.data as FakeNative).callIds) !== JSON.stringify(callIdsOf(message))) {
        throw new LlmError('invalid_request', 'fake: a replayed turn does not match the one the model produced');
      }
    }
  }

  private async waitSlowly(timeoutMs: number): Promise<void> {
    await sleep(Math.min(SLOW_MS, timeoutMs));
    if (timeoutMs < SLOW_MS) throw new LlmError('timeout', 'fake: request timed out');
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

  private answer(
    scenario: FakeScenario,
    request: LlmRequest,
    model: LlmModelRef,
  ): { output: LlmOutput; stop: LlmStopReason } {
    const schema = request.responseSchema?.schema;
    switch (scenario) {
      case 'tool_then_answer':
        if (request.messages.at(-1)?.parts.some((p) => p.type === 'tool_result')) {
          return this.answer('ok', request, model);
        }
        return this.toolCall(scenario, request, model);
      case 'tool_call':
        return this.toolCall(scenario, request, model);
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

  private toolCall(
    scenario: FakeScenario,
    request: LlmRequest,
    model: LlmModelRef,
  ): { output: LlmOutput; stop: LlmStopReason } {
    const tool = request.tools?.[0];
    if (!tool) throw new Error(`fake scenario "${scenario}" needs at least one tool in the request`);
    const call = { id: `fake_call_${randomUUID()}`, name: tool.name, input: sampleFromSchema(tool.inputSchema) };
    const native: FakeNative = { callIds: [call.id] };
    return {
      output: {
        kind: 'tool_calls',
        calls: [call],
        native: { provider: this.kind, providerModelId: model.providerModelId, data: native },
      },
      stop: 'tool',
    };
  }
}

/** What the fake keeps of its own turn: enough to notice a replay that was tampered with. */
interface FakeNative {
  callIds: string[];
}

function callIdsOf(message: LlmMessage): string[] {
  return message.parts.flatMap((p) => (p.type === 'tool_call' ? [p.id] : []));
}

function textsOf(message: LlmMessage): string[] {
  return message.parts.flatMap((p) => (p.type === 'text' ? [p.text] : []));
}

/** Every part as the model would read it — for the token estimate. */
function partText(part: LlmPart): string {
  switch (part.type) {
    case 'text':
      return part.text;
    case 'tool_call':
      return `${part.name}(${JSON.stringify(part.input)})`;
    case 'tool_result':
      return part.content;
  }
}

function isScenario(value: string): value is FakeScenario {
  return (FAKE_SCENARIOS as readonly string[]).includes(value);
}

function promptText(request: LlmRequest): string {
  return [request.system, ...request.messages.flatMap((m) => m.parts.map(partText))].join('\n');
}

function lastUserText(request: LlmRequest): string {
  const last = [...request.messages].reverse().find((m) => m.role === 'user' && textsOf(m).length > 0);
  return last ? textsOf(last).join(' ') : '';
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
