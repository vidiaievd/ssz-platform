import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ExerciseAttemptedConsumer } from './consumers/exercise-attempted.consumer.js';
import { ContainerPublishedConsumer } from './consumers/container-published.consumer.js';

@Module({
  imports: [CqrsModule],
  providers: [ExerciseAttemptedConsumer, ContainerPublishedConsumer],
})
export class EventsModule {}
