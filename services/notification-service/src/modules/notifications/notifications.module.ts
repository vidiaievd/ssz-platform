import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './controllers/notifications.controller.js';
import { UserRegisteredHandler } from './handlers/user-registered.handler.js';
import { EmailVerificationHandler } from './handlers/email-verification.handler.js';
import { PasswordResetHandler } from './handlers/password-reset.handler.js';
import { NudgeRequestedHandler } from './handlers/nudge-requested.handler.js';
import { TeacherAbsenceHandler } from './handlers/teacher-absence.handler.js';
import { SubstituteRequestHandler } from './handlers/substitute-request.handler.js';
import { SubstituteAssignedHandler } from './handlers/substitute-assigned.handler.js';
import { AlertRaisedHandler } from './handlers/alert-raised.handler.js';
import { SchoolInvitationSentHandler } from './handlers/school-invitation-sent.handler.js';
import { TeacherProfileChangedHandler } from './handlers/teacher-profile-changed.handler.js';
import { EnrollmentRequestHandler } from './handlers/enrollment-request.handler.js';
import { EnrollmentApprovedHandler } from './handlers/enrollment-approved.handler.js';
import { EnrollmentRejectedHandler } from './handlers/enrollment-rejected.handler.js';
import { PlacementReviewReadyHandler } from './handlers/placement-review-ready.handler.js';
import { GroupAssignedHandler } from './handlers/group-assigned.handler.js';
import { StudentNudgedHandler } from './handlers/student-nudged.handler.js';
import { AttemptReviewedHandler } from './handlers/attempt-reviewed.handler.js';
import { AnalyticsConsumerService } from '../../infrastructure/messaging/analytics-consumer.service.js';
import { SchedulingConsumerService } from '../../infrastructure/messaging/scheduling-consumer.service.js';
import { OrganizationConsumerService } from '../../infrastructure/messaging/organization-consumer.service.js';
import { ExerciseEngineConsumerService } from '../../infrastructure/messaging/exercise-engine-consumer.service.js';
import { ReviewDigestService } from './schedules/review-digest.service.js';
import { ReviewDigestStateRepository } from './schedules/review-digest-state.repository.js';
import { ReviewLoadClient } from './schedules/clients/review-load.client.js';
import { ReviewReviewersClient } from './schedules/clients/review-reviewers.client.js';

@Module({
  imports: [HttpModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationsService,
    UserRegisteredHandler,
    EmailVerificationHandler,
    PasswordResetHandler,
    NudgeRequestedHandler,
    TeacherAbsenceHandler,
    SubstituteRequestHandler,
    SubstituteAssignedHandler,
    AlertRaisedHandler,
    SchoolInvitationSentHandler,
    TeacherProfileChangedHandler,
    EnrollmentRequestHandler,
    EnrollmentApprovedHandler,
    EnrollmentRejectedHandler,
    PlacementReviewReadyHandler,
    GroupAssignedHandler,
    StudentNudgedHandler,
    AttemptReviewedHandler,
    AnalyticsConsumerService,
    SchedulingConsumerService,
    OrganizationConsumerService,
    ExerciseEngineConsumerService,
    // The review digest (plan 47.5). Registered unconditionally; whether it does anything
    // is `REVIEW_DIGEST_ENABLED` plus having both neighbours addressed, decided inside the
    // run rather than by leaving the provider out — a job that is off should be visible
    // and inspectable, not absent.
    ReviewDigestService,
    ReviewDigestStateRepository,
    ReviewLoadClient,
    ReviewReviewersClient,
  ],
  exports: [NotificationsService, UserRegisteredHandler, EmailVerificationHandler, PasswordResetHandler],
})
export class NotificationsModule {}
