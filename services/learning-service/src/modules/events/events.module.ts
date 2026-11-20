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
import { AtomsFlaggedConsumer } from './consumers/atoms-flagged.consumer.js';
import { SchoolPurgedConsumer } from './consumers/school-purged.consumer.js';
import { SchoolStudyRetiredConsumer } from './consumers/school-study-retired.consumer.js';
import { SchoolStudyPausedConsumer } from './consumers/school-study-paused.consumer.js';
import { SrsModule } from '../srs/srs.module.js';
import { UserErasureModule } from '../user-erasure/user-erasure.module.js';

@Module({
  imports: [
    CqrsModule,
    AssignmentsModule,
    EnrollmentsModule,
    CanDoModule,
    UserErasureModule,
    SrsModule,
  ],
  providers: [
    ExerciseAttemptedConsumer,
    ContainerPublishedConsumer,
    ContainerDeletedConsumer,
    VocabularyEnrollmentConsumer,
    GroupEnrollmentConsumer,
    ExerciseReleasedConsumer,
    UserDeletedConsumer,
    AtomsFlaggedConsumer,
    SchoolPurgedConsumer,
    SchoolStudyRetiredConsumer,
    SchoolStudyPausedConsumer,
  ],
})
export class EventsModule {}
