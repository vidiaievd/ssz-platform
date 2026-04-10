import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from '../../shared/application/ports/event-publisher.interface.js';
import { PROCESSED_EVENTS_REPOSITORY } from '../../shared/application/ports/processed-events.repository.interface.js';
import { ProcessedEventsPrismaRepository } from './processed-events.prisma.repository.js';
import { RabbitMqEventPublisher } from './rabbitmq-event-publisher.service.js';

// @Global() — both EVENT_PUBLISHER and PROCESSED_EVENTS_REPOSITORY are needed
// across multiple modules without re-importing.
@Global()
@Module({
  providers: [
    RabbitMqEventPublisher,
    {
      provide: EVENT_PUBLISHER,
      useExisting: RabbitMqEventPublisher,
    },
    {
      provide: PROCESSED_EVENTS_REPOSITORY,
      useClass: ProcessedEventsPrismaRepository,
    },
  ],
  exports: [EVENT_PUBLISHER, PROCESSED_EVENTS_REPOSITORY],
})
export class RabbitMqModule {}
