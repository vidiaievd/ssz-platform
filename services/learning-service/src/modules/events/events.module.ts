import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { ExerciseAttemptedConsumer } from './consumers/exercise-attempted.consumer.js';
import { ContainerPublishedConsumer } from './consumers/container-published.consumer.js';
import { ContainerDeletedConsumer } from './consumers/container-deleted.consumer.js';

@Module({
  imports: [CqrsModule, AssignmentsModule, EnrollmentsModule],
  providers: [ExerciseAttemptedConsumer, ContainerPublishedConsumer, ContainerDeletedConsumer],
})
export class EventsModule {}
