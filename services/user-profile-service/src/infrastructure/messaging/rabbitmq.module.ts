import { Global, Module } from '@nestjs/common';
import { PROCESSED_EVENTS_REPOSITORY } from '../../shared/application/ports/processed-events.repository.interface.js';
import { ProcessedEventsPrismaRepository } from './processed-events.prisma.repository.js';

// @Global() so PROCESSED_EVENTS_REPOSITORY is available without re-importing.
@Global()
@Module({
  providers: [
    {
      provide: PROCESSED_EVENTS_REPOSITORY,
      useClass: ProcessedEventsPrismaRepository,
    },
  ],
  exports: [PROCESSED_EVENTS_REPOSITORY],
})
export class RabbitMqModule {}
