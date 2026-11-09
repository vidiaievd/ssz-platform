import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { AssignmentsModule } from '../assignments/assignments.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { CanDoModule } from '../can-do/can-do.module.js';
import { ExerciseAttemptedConsumer } from './consumers/exercise-attempted.consumer.js';
import { ContainerPublishedConsumer } from './consumers/container-published.consumer.js';
import { ContainerDeletedConsumer } from './consumers/container-deleted.consumer.js';
import { VocabularyEnrollmentConsumer } from './consumers/vocabulary-enrollment.consumer.js';
import { GroupEnrollmentConsumer } from './consumers/group-enrollment.consumer.js';
import { ExerciseReleasedConsumer } from './consumers/exercise-released.consumer.js';
import { UserDeletedConsumer } from './consumers/user-deleted.consumer.js';
import { UserErasureModule } from '../user-erasure/user-erasure.module.js';

@Module({
  imports: [CqrsModule, AssignmentsModule, EnrollmentsModule, CanDoModule, UserErasureModule],
  providers: [
    ExerciseAttemptedConsumer,
    ContainerPublishedConsumer,
    ContainerDeletedConsumer,
    VocabularyEnrollmentConsumer,
    GroupEnrollmentConsumer,
    ExerciseReleasedConsumer,
    UserDeletedConsumer,
  ],
})
export class EventsModule {}
