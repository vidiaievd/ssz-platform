import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from '../../shared/application/ports/event-publisher.port.js';
import { RabbitmqEventPublisher } from './rabbitmq-event-publisher.js';

@Global()
@Module({
  providers: [
    RabbitmqEventPublisher,
    {
      provide: EVENT_PUBLISHER,
      useExisting: RabbitmqEventPublisher,
    },
  ],
  exports: [EVENT_PUBLISHER, RabbitmqEventPublisher],
})
export class RabbitmqModule {}
