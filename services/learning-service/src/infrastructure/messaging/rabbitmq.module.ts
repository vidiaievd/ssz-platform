import { Global, Module } from '@nestjs/common';
import { LEARNING_EVENT_PUBLISHER } from '../../shared/application/ports/event-publisher.port.js';
import { RabbitmqEventPublisher } from './rabbitmq-event-publisher.js';

@Global()
@Module({
  providers: [
    RabbitmqEventPublisher,
    {
      provide: LEARNING_EVENT_PUBLISHER,
      useExisting: RabbitmqEventPublisher,
    },
  ],
  exports: [LEARNING_EVENT_PUBLISHER, RabbitmqEventPublisher],
})
export class RabbitmqModule {}
