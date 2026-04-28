import { Module } from '@nestjs/common';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { ExerciseDeletedConsumer } from './exercise-deleted.consumer.js';

@Module({
  imports: [AttemptsModule],
  providers: [ExerciseDeletedConsumer],
})
export class EventsModule {}
