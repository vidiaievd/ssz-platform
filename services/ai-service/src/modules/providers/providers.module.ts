import { Module } from '@nestjs/common';
import { SchemaGuard } from './application/schema-guard.js';
import { LLM_PROVIDERS, type LlmProvider } from './domain/llm-provider.port.js';
import { FakeLlmProvider } from './infrastructure/fake/fake-llm.provider.js';

/**
 * Every adapter is registered here and exposed as one list under `LLM_PROVIDERS`; the
 * gateway (step 7) picks one by the registry's `kind`. Real adapters join in steps 4–6.
 */
@Module({
  providers: [
    SchemaGuard,
    FakeLlmProvider,
    {
      provide: LLM_PROVIDERS,
      useFactory: (...providers: LlmProvider[]) => providers,
      inject: [FakeLlmProvider],
    },
  ],
  exports: [SchemaGuard, LLM_PROVIDERS],
})
export class ProvidersModule {}
