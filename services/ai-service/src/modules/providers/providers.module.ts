import { Module } from '@nestjs/common';
import { SchemaGuard } from './application/schema-guard.js';
import { LLM_PROVIDERS, type LlmProvider } from './domain/llm-provider.port.js';
import { AnthropicLlmProvider } from './infrastructure/anthropic/anthropic-llm.provider.js';
import { FakeLlmProvider } from './infrastructure/fake/fake-llm.provider.js';
import { GoogleLlmProvider } from './infrastructure/google/google-llm.provider.js';
import {
  AzureOpenAiLlmProvider,
  OpenAiCompatibleLlmProvider,
  OpenAiLlmProvider,
} from './infrastructure/openai/openai-llm.provider.js';

/**
 * Every adapter is registered here and exposed as one list under `LLM_PROVIDERS`; the
 * gateway (step 7) picks one by the registry's `kind`.
 */
@Module({
  providers: [
    SchemaGuard,
    FakeLlmProvider,
    AnthropicLlmProvider,
    GoogleLlmProvider,
    OpenAiLlmProvider,
    OpenAiCompatibleLlmProvider,
    AzureOpenAiLlmProvider,
    {
      provide: LLM_PROVIDERS,
      useFactory: (...providers: LlmProvider[]) => providers,
      inject: [
        FakeLlmProvider,
        AnthropicLlmProvider,
        GoogleLlmProvider,
        OpenAiLlmProvider,
        OpenAiCompatibleLlmProvider,
        AzureOpenAiLlmProvider,
      ],
    },
  ],
  exports: [SchemaGuard, LLM_PROVIDERS],
})
export class ProvidersModule {}
