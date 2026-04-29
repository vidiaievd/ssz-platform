import { Module } from '@nestjs/common';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { ExerciseDeletedConsumer } from './exercise-deleted.consumer.js';
import { ExerciseUpdatedConsumer } from './exercise-updated.consumer.js';

@Module({
  imports: [AttemptsModule],
  providers: [ExerciseDeletedConsumer, ExerciseUpdatedConsumer],
})
export class EventsModule {}
