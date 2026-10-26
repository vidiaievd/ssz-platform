import { Module } from '@nestjs/common';
import { SchemaGuard } from './application/schema-guard.js';
import { LLM_PROVIDERS, type LlmProvider } from './domain/llm-provider.port.js';
import { SPEECH_ASSESSORS, type SpeechAssessor } from './domain/speech-assessor.port.js';
import { AnthropicLlmProvider } from './infrastructure/anthropic/anthropic-llm.provider.js';
import { FakeLlmProvider } from './infrastructure/fake/fake-llm.provider.js';
import { FakeSpeechAssessor } from './infrastructure/fake/fake-speech.assessor.js';
import { GoogleLlmProvider } from './infrastructure/google/google-llm.provider.js';
import {
  AzureOpenAiLlmProvider,
  OpenAiCompatibleLlmProvider,
  OpenAiLlmProvider,
} from './infrastructure/openai/openai-llm.provider.js';
import { WhisperLocalSpeechAssessor } from './infrastructure/whisper/whisper-local.assessor.js';

/**
 * Every adapter is registered here and exposed as one list under `LLM_PROVIDERS`; the
 * gateway (step 7) picks one by the registry's `kind`. Speech adapters (plan 82) are a list
 * of their own, `SPEECH_ASSESSORS`: one provider kind may have both (`fake`).
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
    FakeSpeechAssessor,
    WhisperLocalSpeechAssessor,
    {
      provide: SPEECH_ASSESSORS,
      useFactory: (...assessors: SpeechAssessor[]) => assessors,
      inject: [FakeSpeechAssessor, WhisperLocalSpeechAssessor],
    },
  ],
  exports: [SchemaGuard, LLM_PROVIDERS, SPEECH_ASSESSORS],
})
export class ProvidersModule {}
