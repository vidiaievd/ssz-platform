import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EXCHANGES } from '@ssz/contracts';
import { OUTBOX_RELAY_OPTIONS, OUTBOX_STORE, OutboxRelayService, type OutboxRelayOptions } from '@ssz/messaging';
import type { AppConfig } from '../../config/configuration.js';
import { PROCESSED_EVENTS } from '../../shared/application/ports/processed-events.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';
import { PrismaProcessedEvents } from './prisma-processed-events.js';

/**
 * The outbox relay — it declares `subscription.events` itself, nobody else publishes
 * there — and the processed-events ledger the consumers share.
 */
@Global()
@Module({
  providers: [
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
        exchanges: [EXCHANGES.SUBSCRIPTION!],
      }),
    },
    OutboxRelayService,
    { provide: PROCESSED_EVENTS, useClass: PrismaProcessedEvents },
  ],
  exports: [PROCESSED_EVENTS],
})
export class MessagingModule {}
