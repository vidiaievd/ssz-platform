import { Module } from '@nestjs/common';
import { SchemaGuard } from './application/schema-guard.js';
import { LLM_PROVIDERS, type LlmProvider } from './domain/llm-provider.port.js';
import { SPEECH_ASSESSORS, type SpeechAssessor } from './domain/speech-assessor.port.js';
import { SPEECH_SYNTHESIZERS, type SpeechSynthesizer } from './domain/speech-synthesizer.port.js';
import { AzureContinuousRecognizer } from './infrastructure/azure-speech/azure-continuous.recognizer.js';
import { AzureSpeechAssessor } from './infrastructure/azure-speech/azure-speech.assessor.js';
import { AzureSpeechSynthesizer } from './infrastructure/azure-speech/azure-speech.synthesizer.js';
import { AnthropicLlmProvider } from './infrastructure/anthropic/anthropic-llm.provider.js';
import { FakeLlmProvider } from './infrastructure/fake/fake-llm.provider.js';
import { FakeSpeechAssessor } from './infrastructure/fake/fake-speech.assessor.js';
import { FakeSpeechSynthesizer } from './infrastructure/fake/fake-speech.synthesizer.js';
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
 * of their own, `SPEECH_ASSESSORS`, and synthesizers (plan 88, step 6b) another,
 * `SPEECH_SYNTHESIZERS`: one provider kind may have several (`fake`, `azure_speech`).
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
    AzureContinuousRecognizer,
    AzureSpeechAssessor,
    {
      provide: SPEECH_ASSESSORS,
      useFactory: (...assessors: SpeechAssessor[]) => assessors,
      inject: [FakeSpeechAssessor, WhisperLocalSpeechAssessor, AzureSpeechAssessor],
    },
    FakeSpeechSynthesizer,
    AzureSpeechSynthesizer,
    {
      provide: SPEECH_SYNTHESIZERS,
      useFactory: (...synthesizers: SpeechSynthesizer[]) => synthesizers,
      inject: [FakeSpeechSynthesizer, AzureSpeechSynthesizer],
    },
  ],
  exports: [SchemaGuard, LLM_PROVIDERS, SPEECH_ASSESSORS, SPEECH_SYNTHESIZERS],
})
export class ProvidersModule {}
