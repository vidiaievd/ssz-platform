import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER, RabbitmqEventPublisher } from './rabbitmq-event-publisher.js';
import { RabbitmqConsumerService } from './rabbitmq-consumer.service.js';

@Global()
@Module({
  providers: [
    RabbitmqEventPublisher,
    RabbitmqConsumerService,
    { provide: EVENT_PUBLISHER, useExisting: RabbitmqEventPublisher },
  ],
  exports: [EVENT_PUBLISHER, RabbitmqConsumerService],
})
export class RabbitmqModule {}
