import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AttemptsModule } from '../attempts/attempts.module.js';
import { UserErasureModule } from '../user-erasure/user-erasure.module.js';
import { ExerciseDeletedConsumer } from './exercise-deleted.consumer.js';
import { UserDeletedConsumer } from './user-deleted.consumer.js';

@Module({
  imports: [CqrsModule, AttemptsModule, UserErasureModule],
  providers: [ExerciseDeletedConsumer, UserDeletedConsumer],
})
export class EventsModule {}
