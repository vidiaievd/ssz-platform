import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@ssz/contracts';
import { OUTBOX_RELAY_OPTIONS, OUTBOX_STORE, OutboxRelayService, type OutboxRelayOptions } from '@ssz/messaging';
import type { AppConfig } from '../../config/configuration.js';
import { CallRecorder, CREDIT_RATE } from './application/call-recorder.js';
import { LedgerSpoolDrainer, SPOOL_DRAIN_INTERVAL_MS } from './application/ledger-spool-drainer.js';
import { AI_CALL_LEDGER } from './application/ports/ai-call.ledger.js';
import { LEDGER_SPOOL } from './application/ports/ledger-spool.js';
import { LEDGER_USAGE_READER } from './application/ports/ledger-usage.reader.js';
import { PrismaAiCallLedger } from './infrastructure/prisma-ai-call.ledger.js';
import { PrismaLedgerUsageReader } from './infrastructure/prisma-ledger-usage.reader.js';
import { PrismaOutboxStore } from './infrastructure/prisma-outbox.store.js';
import { RedisLedgerSpool } from './infrastructure/redis-ledger-spool.js';

/**
 * Every gateway call, priced, with its `ai.call.completed` event. The relay polls the
 * outbox and declares `ai.events` itself — nobody else publishes there. A row the database
 * cannot take right now waits in the Redis spool until the drainer moves it in.
 */
@Module({
  providers: [
    { provide: AI_CALL_LEDGER, useClass: PrismaAiCallLedger },
    { provide: LEDGER_USAGE_READER, useClass: PrismaLedgerUsageReader },
    {
      provide: CREDIT_RATE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => config.get<string>('creditsPerUsd')!,
    },
    { provide: LEDGER_SPOOL, useClass: RedisLedgerSpool },
    {
      provide: SPOOL_DRAIN_INTERVAL_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => config.get<number>('ledgerSpoolDrainMs')!,
    },
    CallRecorder,
    LedgerSpoolDrainer,
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
  exports: [CallRecorder, LEDGER_USAGE_READER],
})
export class LedgerModule {}
