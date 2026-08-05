import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { RabbitmqModule } from '../../infrastructure/messaging/rabbitmq.module.js';
import { SrsModule } from '../srs/srs.module.js';
import { RecordLookupsHandler } from './application/commands/record-lookups.handler.js';
import { LookupsController } from './presentation/lookups.controller.js';

/**
 * Reader telemetry (web spec 18). No domain layer and no repository of its own:
 * a lookup is a report about something that already happened in the browser,
 * not a state this service owns. SrsModule supplies the card repository the
 * handler reads the learner's state from, and the outbox publisher turns each
 * lookup into a domain event.
 */
@Module({
  imports: [CqrsModule, RabbitmqModule, SrsModule],
  controllers: [LookupsController],
  providers: [RecordLookupsHandler],
})
export class LookupsModule {}
