import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxRelayService, OUTBOX_STORE, OUTBOX_RELAY_OPTIONS } from '@ssz/messaging';
import type { AppConfig } from '../../config/configuration.js';
import { CONTENT_EVENT_PUBLISHER } from '../../shared/application/ports/event-publisher.port.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';
import { OutboxEventPublisher } from './outbox-event-publisher.js';

@Global()
@Module({
  providers: [
    PrismaOutboxStore,
    {
      provide: OUTBOX_STORE,
      useExisting: PrismaOutboxStore,
    },
    {
      provide: OUTBOX_RELAY_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig>) => ({
        rabbitmqUrl: config.get<AppConfig['rabbitmq']>('rabbitmq')?.url ?? '',
        pollIntervalMs: 1_000,
        batchSize: 50,
        maxAttempts: 5,
      }),
    },
    OutboxRelayService,
    OutboxEventPublisher,
    {
      provide: CONTENT_EVENT_PUBLISHER,
      useExisting: OutboxEventPublisher,
    },
  ],
  exports: [CONTENT_EVENT_PUBLISHER, OutboxEventPublisher, PrismaOutboxStore],
})
export class RabbitmqModule {}
