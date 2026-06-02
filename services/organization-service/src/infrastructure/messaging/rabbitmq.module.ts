import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxRelayService, OUTBOX_STORE, OUTBOX_RELAY_OPTIONS } from '@ssz/messaging';
import type { Env } from '../../config/configuration.js';
import { EVENT_PUBLISHER } from '../../shared/application/ports/event-publisher.interface.js';
import { PROCESSED_EVENTS_REPOSITORY } from '../../shared/application/ports/processed-events.repository.interface.js';
import { ProcessedEventsPrismaRepository } from '../persistence/processed-events.prisma.repository.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';
import { OutboxEventPublisherService } from './outbox-event-publisher.service.js';

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
      useFactory: (config: ConfigService<Env>) => ({
        rabbitmqUrl: config.get('RABBITMQ_URL') ?? '',
        pollIntervalMs: 1_000,
        batchSize: 50,
        maxAttempts: 5,
      }),
    },
    OutboxRelayService,
    OutboxEventPublisherService,
    {
      provide: EVENT_PUBLISHER,
      useExisting: OutboxEventPublisherService,
    },
    {
      provide: PROCESSED_EVENTS_REPOSITORY,
      useClass: ProcessedEventsPrismaRepository,
    },
  ],
  exports: [EVENT_PUBLISHER, PROCESSED_EVENTS_REPOSITORY, OutboxEventPublisherService, PrismaOutboxStore],
})
export class RabbitMqModule {}
