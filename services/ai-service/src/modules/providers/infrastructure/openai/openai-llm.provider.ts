import { Injectable } from '@nestjs/common';
import OpenAI, { AzureOpenAI } from 'openai';
import { LlmError } from '../../domain/llm-error.js';
import type { LlmProvider } from '../../domain/llm-provider.port.js';
import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmChunk, LlmResult } from '../../domain/llm-result.js';
import type { LlmModelRef, ProviderConnection } from '../../domain/model-features.js';
import { readCredential } from '../credentials.js';
import { toLlmError } from './openai-error.mapper.js';
import { toOpenAiCall } from './openai-request.mapper.js';
import { fromOpenAiCompletion, type OpenAiCompletion } from './openai-response.mapper.js';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

/**
 * Chat Completions through the `openai` SDK — one code path for three provider kinds that
 * differ only in how the client is built (see the subclasses below).
 *
 * SDK retries are off (`maxRetries: 0`) for the same reason as in the other adapters: the
 * router decides whether to try again, and on which model. Everything the SDK would read
 * from the environment (`OPENAI_BASE_URL`, `OPENAI_ORG_ID`, `AZURE_OPENAI_ENDPOINT`…) is
 * passed explicitly, so the registry row is the only source of where a call goes.
 */
abstract class OpenAiFamilyProvider implements LlmProvider {
  abstract readonly kind: 'openai' | 'openai_compatible' | 'azure_openai';
  /** Provider name in error messages. */
  protected abstract readonly label: string;
  private readonly clients = new Map<string, OpenAI>();

  protected abstract createClient(provider: ProviderConnection, apiKey: string | null): OpenAI;

  async complete(request: LlmRequest, model: LlmModelRef): Promise<LlmResult> {
    const { params, mode } = toOpenAiCall(request, model, this.kind);
    const started = Date.now();
    try {
      const client = this.clientFor(model);
      const completion = await client.chat.completions.create(params, { timeout: request.timeoutMs });
      return fromOpenAiCompletion({ ...completion, requestId: completion._request_id }, mode, Date.now() - started);
    } catch (err) {
      throw toLlmError(err, this.label);
    }
  }

  async *stream(request: LlmRequest, model: LlmModelRef): AsyncIterable<LlmChunk> {
    const { params, mode } = toOpenAiCall(request, model, this.kind);
    const started = Date.now();
    try {
      const client = this.clientFor(model);
      const { data: chunks, request_id } = await client.chat.completions
        .create({ ...params, stream: true, stream_options: { include_usage: true } }, { timeout: request.timeoutMs })
        .withResponse();

      // Deltas are stitched back into one completion; usage arrives on a last, choice-less chunk.
      const merged: OpenAiCompletion = { id: '', choices: [], requestId: request_id };
      let content = '';
      let refusal = '';
      let finish: OpenAiCompletion['choices'][number]['finish_reason'] = null;
      const calls: Array<{ id: string; name: string; arguments: string }> = [];
      for await (const chunk of chunks) {
        merged.id ||= chunk.id;
        merged.usage = chunk.usage ?? merged.usage;
        const choice = chunk.choices[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (delta.content) {
          content += delta.content;
          yield { type: 'text_delta', text: delta.content };
        }
        if (delta.refusal) refusal += delta.refusal;
        for (const piece of delta.tool_calls ?? []) {
          const call = (calls[piece.index] ??= { id: '', name: '', arguments: '' });
          if (piece.id) call.id = piece.id;
          if (piece.function?.name) call.name += piece.function.name;
          if (piece.function?.arguments) call.arguments += piece.function.arguments;
        }
        finish = choice.finish_reason ?? finish;
      }
      merged.choices = [
        {
          finish_reason: finish,
          message: {
            content: content || null,
            refusal: refusal || null,
            tool_calls: calls.filter(Boolean).map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: c.arguments },
            })),
          },
        },
      ];

      const result = fromOpenAiCompletion(merged, mode, Date.now() - started);
      if (result.output.kind === 'tool_calls') {
        for (const call of result.output.calls) yield { type: 'tool_call', call };
      }
      yield { type: 'done', result };
    } catch (err) {
      throw toLlmError(err, this.label);
    }
  }

  private clientFor(model: LlmModelRef): OpenAI {
    const apiKey = readCredential(model.provider);
    const { code, baseUrl, apiVersion } = model.provider;
    const key = `${code}|${baseUrl ?? ''}|${apiVersion ?? ''}|${apiKey ?? ''}`;
    let client = this.clients.get(key);
    if (!client) {
      client = this.createClient(model.provider, apiKey);
      this.clients.set(key, client);
    }
    return client;
  }

  /** Missing connection settings are `auth`: final, and fixed by an admin, not by a retry. */
  protected require(provider: ProviderConnection, field: 'baseUrl' | 'apiVersion'): string {
    const value = provider[field];
    if (!value) throw new LlmError('auth', `Provider "${provider.code}" is not configured: ${field} is not set`);
    return value;
  }
}

/** api.openai.com, or a regional endpoint when the registry row sets `baseUrl`. */
@Injectable()
export class OpenAiLlmProvider extends OpenAiFamilyProvider {
  readonly kind = 'openai' as const;
  protected readonly label = 'OpenAI';

  protected createClient(provider: ProviderConnection, apiKey: string | null): OpenAI {
    return new OpenAI({
      apiKey,
      baseURL: provider.baseUrl ?? OPENAI_BASE_URL,
      organization: null,
      project: null,
      maxRetries: 0,
    });
  }
}

/**
 * Any server that speaks the OpenAI dialect (Ollama, vLLM, LM Studio, OpenRouter…). What
 * it can do — `native` structured output above all — comes from the registry, never from
 * the assumption that it behaves like OpenAI.
 */
@Injectable()
export class OpenAiCompatibleLlmProvider extends OpenAiFamilyProvider {
  readonly kind = 'openai_compatible' as const;
  protected readonly label = 'OpenAI-compatible';

  protected createClient(provider: ProviderConnection, apiKey: string | null): OpenAI {
    return new OpenAI({
      // A keyless local server still needs a value: the SDK refuses to start without one.
      apiKey: apiKey ?? 'not-needed',
      baseURL: this.require(provider, 'baseUrl'),
      organization: null,
      project: null,
      maxRetries: 0,
    });
  }
}

/**
 * Azure OpenAI: `baseUrl` is the resource endpoint, `apiVersion` the dated API version,
 * and the model's `providerModelId` is the deployment name — the SDK puts it in the path.
 */
@Injectable()
export class AzureOpenAiLlmProvider extends OpenAiFamilyProvider {
  readonly kind = 'azure_openai' as const;
  protected readonly label = 'Azure OpenAI';

  protected createClient(provider: ProviderConnection, apiKey: string | null): OpenAI {
    return new AzureOpenAI({
      endpoint: this.require(provider, 'baseUrl'),
      apiVersion: this.require(provider, 'apiVersion'),
      apiKey: apiKey ?? undefined,
      maxRetries: 0,
    });
  }
}
