import { Module } from '@nestjs/common';
import { ExerciseDeletedConsumer } from './exercise-deleted.consumer.js';

@Module({
  providers: [ExerciseDeletedConsumer],
})
export class EventsModule {}
