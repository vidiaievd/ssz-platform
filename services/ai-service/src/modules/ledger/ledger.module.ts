import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@ssz/contracts';
import { OUTBOX_RELAY_OPTIONS, OUTBOX_STORE, OutboxRelayService, type OutboxRelayOptions } from '@ssz/messaging';
import type { AppConfig } from '../../config/configuration.js';
import { CallRecorder, CREDIT_RATE } from './application/call-recorder.js';
import { AI_CALL_LEDGER } from './application/ports/ai-call.ledger.js';
import { PrismaAiCallLedger } from './infrastructure/prisma-ai-call.ledger.js';
import { PrismaOutboxStore } from './infrastructure/prisma-outbox.store.js';

/**
 * Every gateway call, priced, with its `ai.call.completed` event. The relay polls the
 * outbox and declares `ai.events` itself — nobody else publishes there.
 */
@Module({
  providers: [
    { provide: AI_CALL_LEDGER, useClass: PrismaAiCallLedger },
    {
      provide: CREDIT_RATE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => config.get<string>('creditsPerUsd')!,
    },
    CallRecorder,
    PrismaOutboxStore,
    { provide: OUTBOX_STORE, useExisting: PrismaOutboxStore },
    {
      provide: OUTBOX_RELAY_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>): OutboxRelayOptions => ({
        rabbitmqUrl: config.get<AppConfig['rabbitmq']>('rabbitmq')?.url ?? '',
        pollIntervalMs: 1_000,
        batchSize: 50,
        maxAttempts: 5,
        exchanges: [EXCHANGES.AI!],
      }),
    },
    OutboxRelayService,
  ],
  exports: [CallRecorder],
})
export class LedgerModule {}
