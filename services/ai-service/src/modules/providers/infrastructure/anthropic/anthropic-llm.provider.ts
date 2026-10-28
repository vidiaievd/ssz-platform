import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import type { LlmProvider } from '../../domain/llm-provider.port.js';
import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmChunk, LlmResult } from '../../domain/llm-result.js';
import type { LlmModelRef } from '../../domain/model-features.js';
import { readCredential } from '../credentials.js';
import { toLlmError } from './anthropic-error.mapper.js';
import { toAnthropicCall } from './anthropic-request.mapper.js';
import { fromAnthropicMessage } from './anthropic-response.mapper.js';

/**
 * Anthropic Messages API through the official SDK.
 *
 * SDK retries are off (`maxRetries: 0`): whether a failure is worth another try, and on
 * which model, is the router's call (step 7) — a retry hidden here would spend the
 * request's timeout before the fallback ever gets a chance.
 */
@Injectable()
export class AnthropicLlmProvider implements LlmProvider {
  readonly kind = 'anthropic' as const;
  private readonly clients = new Map<string, Anthropic>();

  async complete(request: LlmRequest, model: LlmModelRef): Promise<LlmResult> {
    const { params, mode } = toAnthropicCall(request, model);
    const client = this.clientFor(model);
    const started = Date.now();
    try {
      const message = await client.messages.create(params, { timeout: request.timeoutMs });
      return fromAnthropicMessage(message, mode, Date.now() - started, model.providerModelId);
    } catch (err) {
      throw toLlmError(err);
    }
  }

  async *stream(request: LlmRequest, model: LlmModelRef): AsyncIterable<LlmChunk> {
    const { params, mode } = toAnthropicCall(request, model);
    const client = this.clientFor(model);
    const started = Date.now();
    try {
      const stream = client.messages.stream(params, { timeout: request.timeoutMs });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        }
      }
      const result = fromAnthropicMessage(await stream.finalMessage(), mode, Date.now() - started, model.providerModelId);
      if (result.output.kind === 'tool_calls') {
        for (const call of result.output.calls) yield { type: 'tool_call', call };
      }
      yield { type: 'done', result };
    } catch (err) {
      throw toLlmError(err);
    }
  }

  private clientFor(model: LlmModelRef): Anthropic {
    const apiKey = readCredential(model.provider);
    const key = `${model.provider.code}|${model.provider.baseUrl ?? ''}|${apiKey ?? ''}`;
    let client = this.clients.get(key);
    if (!client) {
      client = new Anthropic({
        apiKey: apiKey ?? undefined,
        baseURL: model.provider.baseUrl ?? undefined,
        maxRetries: 0,
      });
      this.clients.set(key, client);
    }
    return client;
  }
}
