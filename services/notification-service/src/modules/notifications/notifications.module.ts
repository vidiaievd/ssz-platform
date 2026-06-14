import { Module } from '@nestjs/common';
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
import { AnalyticsConsumerService } from '../../infrastructure/messaging/analytics-consumer.service.js';
import { SchedulingConsumerService } from '../../infrastructure/messaging/scheduling-consumer.service.js';
import { OrganizationConsumerService } from '../../infrastructure/messaging/organization-consumer.service.js';

@Module({
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
    AnalyticsConsumerService,
    SchedulingConsumerService,
    OrganizationConsumerService,
  ],
  exports: [NotificationsService, UserRegisteredHandler, EmailVerificationHandler, PasswordResetHandler],
})
export class NotificationsModule {}
