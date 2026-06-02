import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ArchiveAllConsumer } from './consumers/archive-all.consumer.js';
import { ReplayEventsHandler } from './queries/replay-events.handler.js';
import { EventArchiveController } from './event-archive.controller.js';

@Module({
  imports: [CqrsModule],
  controllers: [EventArchiveController],
  providers: [ArchiveAllConsumer, ReplayEventsHandler],
})
export class EventArchiveModule {}
