import { Global, Module } from '@nestjs/common';
import { CONTENT_EVENT_PUBLISHER } from '../../shared/application/ports/event-publisher.port.js';
import { RabbitmqEventPublisher } from './rabbitmq-event-publisher.js';

// @Global() — CONTENT_EVENT_PUBLISHER token is injected across all feature modules
// without re-importing this module.
@Global()
@Module({
  providers: [
    RabbitmqEventPublisher,
    {
      provide: CONTENT_EVENT_PUBLISHER,
      useExisting: RabbitmqEventPublisher,
    },
  ],
  exports: [CONTENT_EVENT_PUBLISHER],
})
export class RabbitmqModule {}
