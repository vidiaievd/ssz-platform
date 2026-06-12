import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxRelayService, OUTBOX_STORE, OUTBOX_RELAY_OPTIONS } from '@ssz/messaging';
import type { Env } from '../../config/configuration.js';
import { PrismaOutboxStore } from './prisma-outbox.store.js';
import {
  SchedulingEventPublisherService,
  SCHEDULING_EVENT_PUBLISHER,
} from './scheduling-event-publisher.service.js';

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
    SchedulingEventPublisherService,
    {
      provide: SCHEDULING_EVENT_PUBLISHER,
      useExisting: SchedulingEventPublisherService,
    },
  ],
  exports: [SCHEDULING_EVENT_PUBLISHER, SchedulingEventPublisherService, PrismaOutboxStore],
})
export class RabbitMqModule {}
