import { Module } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationsService } from './notifications.service.js';
import { UserRegisteredHandler } from './handlers/user-registered.handler.js';
import { EmailVerificationHandler } from './handlers/email-verification.handler.js';
import { PasswordResetHandler } from './handlers/password-reset.handler.js';
import { NudgeRequestedHandler } from './handlers/nudge-requested.handler.js';
import { AnalyticsConsumerService } from '../../infrastructure/messaging/analytics-consumer.service.js';

@Module({
  providers: [
    NotificationsRepository,
    NotificationsService,
    UserRegisteredHandler,
    EmailVerificationHandler,
    PasswordResetHandler,
    NudgeRequestedHandler,
    AnalyticsConsumerService,
  ],
  exports: [NotificationsService, UserRegisteredHandler, EmailVerificationHandler, PasswordResetHandler],
})
export class NotificationsModule {}
