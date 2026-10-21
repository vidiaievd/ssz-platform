import { GoogleGenAI, type Candidate, type Part } from '@google/genai';
import { Injectable } from '@nestjs/common';
import type { LlmProvider } from '../../domain/llm-provider.port.js';
import type { LlmRequest } from '../../domain/llm-request.js';
import type { LlmChunk, LlmResult } from '../../domain/llm-result.js';
import type { LlmModelRef } from '../../domain/model-features.js';
import { readCredential } from '../credentials.js';
import { toLlmError } from './google-error.mapper.js';
import { toGoogleCall } from './google-request.mapper.js';
import { answerText, fromGoogleResponse, type GoogleResponse } from './google-response.mapper.js';

/**
 * Gemini API through `@google/genai`.
 *
 * The SDK retries nothing unless asked (`httpOptions.retryOptions` is left unset), for the
 * same reason the Anthropic adapter turns retries off: the router decides whether to try
 * again, and on which model.
 */
@Injectable()
export class GoogleLlmProvider implements LlmProvider {
  readonly kind = 'google' as const;
  private readonly clients = new Map<string, GoogleGenAI>();

  async complete(request: LlmRequest, model: LlmModelRef): Promise<LlmResult> {
    const { params, mode } = toGoogleCall(request, model);
    const client = this.clientFor(model);
    const started = Date.now();
    try {
      const response = await client.models.generateContent(params);
      return fromGoogleResponse(response, mode, Date.now() - started);
    } catch (err) {
      throw toLlmError(err);
    }
  }

  async *stream(request: LlmRequest, model: LlmModelRef): AsyncIterable<LlmChunk> {
    const { params, mode } = toGoogleCall(request, model);
    const client = this.clientFor(model);
    const started = Date.now();
    try {
      const chunks = await client.models.generateContentStream(params);
      // Each chunk carries a slice of the parts; usage and the finish reason arrive on the last.
      const parts: Part[] = [];
      const merged: GoogleResponse = {};
      let candidate: Candidate | undefined;
      for await (const chunk of chunks) {
        const piece = chunk.candidates?.[0];
        const delta = answerText(piece?.content?.parts);
        if (delta) yield { type: 'text_delta', text: delta };
        if (piece) {
          parts.push(...(piece.content?.parts ?? []));
          candidate = { ...candidate, ...piece };
        }
        merged.usageMetadata = chunk.usageMetadata ?? merged.usageMetadata;
        merged.responseId = chunk.responseId ?? merged.responseId;
        merged.promptFeedback = chunk.promptFeedback ?? merged.promptFeedback;
      }
      if (candidate) merged.candidates = [{ ...candidate, content: { role: 'model', parts } }];

      const result = fromGoogleResponse(merged, mode, Date.now() - started);
      if (result.output.kind === 'tool_calls') {
        for (const call of result.output.calls) yield { type: 'tool_call', call };
      }
      yield { type: 'done', result };
    } catch (err) {
      throw toLlmError(err);
    }
  }

  private clientFor(model: LlmModelRef): GoogleGenAI {
    const apiKey = readCredential(model.provider);
    const { baseUrl, apiVersion } = model.provider;
    const key = `${model.provider.code}|${baseUrl ?? ''}|${apiVersion ?? ''}|${apiKey ?? ''}`;
    let client = this.clients.get(key);
    if (!client) {
      client = new GoogleGenAI({
        apiKey: apiKey ?? undefined,
        httpOptions: {
          ...(baseUrl ? { baseUrl } : {}),
          ...(apiVersion ? { apiVersion } : {}),
        },
      });
      this.clients.set(key, client);
    }
    return client;
  }
}
